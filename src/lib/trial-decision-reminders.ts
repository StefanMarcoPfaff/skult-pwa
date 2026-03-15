import {
  sendTeacherTrialDecisionReminderEmail,
  type TeacherTrialDecisionReminderEmailData,
} from "@/lib/trial-reservation-emails";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

type TrialDecisionReminderRow = {
  id: string;
  course_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  trial_starts_at: string | null;
  trial_ends_at: string | null;
  decision_status: string | null;
  teacher_decision_reminder_sent_at: string | null;
};

type TicketRow = {
  trial_reservation_id: string | null;
  status: string | null;
};

type CourseMailRow = {
  id: string;
  title: string | null;
  teacher_id: string | null;
};

type ProfileRow = {
  first_name: string | null;
  last_name: string | null;
};

type SupabaseLikeError = {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
};

type ReminderSkippedReasons = {
  not_checked_in: number;
  missing_mail_context: number;
};

export type TrialDecisionReminderRunResult = {
  scannedCandidateCount: number;
  eligibleCount: number;
  attemptedCount: number;
  sentCount: number;
  failedCount: number;
  updatedReservationCount: number;
  skippedReasons: ReminderSkippedReasons;
  dueBefore: string;
};

/*
 * MVP reminder flow:
 * 1. Trial ticket is checked in.
 * 2. trial_ends_at passes.
 * 3. Vercel Cron calls /api/trial/decision-reminders every 15 minutes.
 * 4. Teacher receives one reminder email linking to /dashboard/participants.
 * 5. approval/rejection clears the pending state.
 */

function isDev(): boolean {
  return process.env.NODE_ENV !== "production";
}

function logReminderInfo(message: string, payload: Record<string, unknown>) {
  if (!isDev()) return;
  console.log("[trial decision reminder]", message, payload);
}

function logReminderError(context: string, error: unknown, extra?: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production") return;
  const supabaseError = (error ?? {}) as SupabaseLikeError;
  console.error("[trial decision reminder]", {
    context,
    message: supabaseError.message,
    code: supabaseError.code,
    details: supabaseError.details,
    hint: supabaseError.hint,
    ...extra,
  });
}

function getDashboardParticipantsUrl(): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  return `${siteUrl}/dashboard/participants`;
}

async function loadMailContext(admin: ReturnType<typeof createSupabaseAdmin>, courseId: string) {
  const { data: course, error: courseError } = await admin
    .from("courses")
    .select("id,title,teacher_id")
    .eq("id", courseId)
    .maybeSingle<CourseMailRow>();

  if (courseError || !course || !course.teacher_id) {
    logReminderError("load-mail-course", courseError, { courseId });
    return null;
  }

  const [{ data: profile }, authResult] = await Promise.all([
    admin
      .from("profiles")
      .select("first_name,last_name")
      .eq("id", course.teacher_id)
      .maybeSingle<ProfileRow>(),
    admin.auth.admin.getUserById(course.teacher_id),
  ]);

  const nameParts = [profile?.first_name, profile?.last_name].filter(Boolean);

  return {
    courseTitle: course.title ?? "Kurs",
    teacherName: nameParts.length > 0 ? nameParts.join(" ") : null,
    teacherEmail: authResult.data.user?.email ?? null,
  };
}

function toEmailPayload(
  reservation: TrialDecisionReminderRow,
  mailContext: Awaited<ReturnType<typeof loadMailContext>>
): TeacherTrialDecisionReminderEmailData | null {
  if (!mailContext || !reservation.trial_starts_at || !reservation.trial_ends_at) return null;

  return {
    reservationId: reservation.id,
    courseTitle: mailContext.courseTitle,
    teacherName: mailContext.teacherName,
    teacherEmail: mailContext.teacherEmail,
    customerName: [reservation.first_name, reservation.last_name].filter(Boolean).join(" ").trim() || "Der Probeschueler",
    customerEmail: reservation.email,
    trialStartsAt: reservation.trial_starts_at,
    trialEndsAt: reservation.trial_ends_at,
    dashboardUrl: getDashboardParticipantsUrl(),
  };
}

export async function runTrialDecisionReminderJob(
  now = new Date()
): Promise<TrialDecisionReminderRunResult> {
  const admin = createSupabaseAdmin();
  const dueBefore = now.toISOString();

  logReminderInfo("started", { dueBefore });

  const { data: reservations, error } = await admin
    .from("trial_reservations")
    .select(
      "id,course_id,first_name,last_name,email,trial_starts_at,trial_ends_at,decision_status,teacher_decision_reminder_sent_at"
    )
    .eq("decision_status", "pending")
    .is("cancelled_at", null)
    .is("teacher_decision_reminder_sent_at", null)
    .lte("trial_ends_at", dueBefore)
    .order("trial_ends_at", { ascending: true })
    .returns<TrialDecisionReminderRow[]>();

  if (error) {
    logReminderError("load-due-reservations", error, { dueBefore });
    throw error;
  }

  const scannedCandidateCount = reservations?.length ?? 0;
  logReminderInfo("candidates loaded", { scannedCandidateCount });

  const reservationIds = (reservations ?? []).map((reservation) => reservation.id);
  const { data: tickets, error: ticketError } = reservationIds.length
    ? await admin
        .from("tickets")
        .select("trial_reservation_id,status")
        .in("trial_reservation_id", reservationIds)
        .returns<TicketRow[]>()
    : { data: [] as TicketRow[], error: null };

  if (ticketError) {
    logReminderError("load-linked-tickets", ticketError, { scannedCandidateCount });
    throw ticketError;
  }

  const checkedInReservationIds = new Set(
    (tickets ?? [])
      .filter((ticket) => ticket.trial_reservation_id && ticket.status === "checked_in")
      .map((ticket) => ticket.trial_reservation_id as string)
  );

  const skippedReasons: ReminderSkippedReasons = {
    not_checked_in: 0,
    missing_mail_context: 0,
  };

  let eligibleCount = 0;
  let attemptedCount = 0;
  let sentCount = 0;
  let failedCount = 0;
  let updatedReservationCount = 0;

  for (const reservation of reservations ?? []) {
    if (!checkedInReservationIds.has(reservation.id)) {
      skippedReasons.not_checked_in += 1;
      continue;
    }

    eligibleCount += 1;

    const mailContext = await loadMailContext(admin, reservation.course_id);
    const payload = toEmailPayload(reservation, mailContext);

    if (!payload) {
      skippedReasons.missing_mail_context += 1;
      continue;
    }

    attemptedCount += 1;

    try {
      const result = await sendTeacherTrialDecisionReminderEmail(payload);
      if (!result) {
        failedCount += 1;
        logReminderInfo("send skipped", { reservationId: reservation.id });
        continue;
      }
      sentCount += 1;
      logReminderInfo("send success", { reservationId: reservation.id });
    } catch (sendError) {
      failedCount += 1;
      logReminderError("send-reminder-email", sendError, { reservationId: reservation.id });
      continue;
    }

    const { error: updateError } = await admin
      .from("trial_reservations")
      .update({ teacher_decision_reminder_sent_at: new Date().toISOString() })
      .eq("id", reservation.id)
      .eq("decision_status", "pending")
      .is("teacher_decision_reminder_sent_at", null);

    if (updateError) {
      failedCount += 1;
      logReminderError("mark-reminder-sent", updateError, { reservationId: reservation.id });
      continue;
    }

    updatedReservationCount += 1;
  }

  const summary: TrialDecisionReminderRunResult = {
    scannedCandidateCount,
    eligibleCount,
    attemptedCount,
    sentCount,
    failedCount,
    updatedReservationCount,
    skippedReasons,
    dueBefore,
  };

  logReminderInfo("finished", summary);

  return summary;
}
