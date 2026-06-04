import {
  sendTrialReservationReminderEmail,
  type TrialReservationEmailData,
} from "@/lib/trial-reservation-emails";
import { getProviderDisplayName } from "@/lib/provider-profiles";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

type TrialReservationReminderRow = {
  id: string;
  course_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  is_simulation: boolean | null;
  trial_starts_at: string | null;
  trial_ends_at: string | null;
  cancel_token: string | null;
  reminder_sent_at: string | null;
};

type CourseMailRow = {
  id: string;
  title: string | null;
  location: string | null;
  teacher_id: string | null;
  instructor_name: string | null;
};

type ProfileRow = {
  first_name: string | null;
  last_name: string | null;
  provider_type: "independent_teacher" | "studio_provider" | null;
  organization_name: string | null;
  photo_url: string | null;
  company_logo_url: string | null;
};

type SupabaseLikeError = {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
};

export type TrialReservationReminderRunResult = {
  processed: number;
  sent: number;
  skipped: number;
  failed: number;
  windowStart: string;
  windowEnd: string;
};

function logReminderError(context: string, error: unknown, extra?: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production") return;
  const supabaseError = (error ?? {}) as SupabaseLikeError;
  console.error("[trial reminder]", {
    context,
    message: supabaseError.message,
    code: supabaseError.code,
    details: supabaseError.details,
    hint: supabaseError.hint,
    ...extra,
  });
}

async function loadMailContext(admin: ReturnType<typeof createSupabaseAdmin>, courseId: string) {
  const { data: course, error: courseError } = await admin
    .from("courses")
    .select("id,title,location,teacher_id,instructor_name")
    .eq("id", courseId)
    .maybeSingle<CourseMailRow>();

  if (courseError || !course) {
    logReminderError("load-mail-course", courseError, { courseId });
    return null;
  }

  const teacherName: string | null = course.instructor_name ?? null;
  let teacherEmail: string | null = null;
  let providerType: "independent_teacher" | "studio_provider" | null = null;
  let providerName: string | null = null;
  let senderDisplayName: string | null = null;
  let senderImageUrl: string | null = null;
  let providerLogoUrl: string | null = null;

  if (course.teacher_id) {
    const [{ data: profile }, authResult] = await Promise.all([
      admin
        .from("profiles")
        .select("first_name,last_name,provider_type,organization_name,photo_url,company_logo_url")
        .eq("id", course.teacher_id)
        .maybeSingle<ProfileRow>(),
      admin.auth.admin.getUserById(course.teacher_id),
    ]);

    teacherEmail = authResult.data.user?.email ?? null;
    providerType = profile?.provider_type ?? null;
    providerName =
      profile?.provider_type ? getProviderDisplayName(profile.provider_type, profile) : null;
    senderDisplayName = providerType === "studio_provider" ? providerName : teacherName;
    senderImageUrl = profile?.photo_url ?? null;
    providerLogoUrl = profile?.company_logo_url ?? null;
  }

  return {
    courseTitle: course.title ?? "Kurs",
    location: course.location,
    teacherName,
    teacherEmail,
    providerType,
    providerName,
    senderDisplayName,
    senderImageUrl,
    providerLogoUrl,
  };
}

function buildCancelUrl(cancelToken: string): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  return `${siteUrl}/trial/cancel/${cancelToken}`;
}

function buildReminderWindow(now = new Date()) {
  return {
    windowStart: new Date(now.getTime() + 23 * 60 * 60 * 1000).toISOString(),
    windowEnd: new Date(now.getTime() + 25 * 60 * 60 * 1000).toISOString(),
  };
}

function toEmailPayload(
  reservation: TrialReservationReminderRow,
  mailContext: Awaited<ReturnType<typeof loadMailContext>>
): TrialReservationEmailData | null {
  if (!mailContext) return null;
  if (!reservation.email || !reservation.trial_starts_at || !reservation.trial_ends_at || !reservation.cancel_token) {
    return null;
  }

  return {
    reservationId: reservation.id,
    courseTitle: mailContext.courseTitle,
    providerType: mailContext.providerType,
    providerName: mailContext.providerName,
    teacherName: mailContext.teacherName,
    teacherEmail: mailContext.teacherEmail,
    senderDisplayName: mailContext.senderDisplayName,
    senderImageUrl: mailContext.senderImageUrl,
    providerLogoUrl: mailContext.providerLogoUrl,
    customerName: [reservation.first_name, reservation.last_name].filter(Boolean).join(" ").trim() || "du",
    customerEmail: reservation.email,
    location: mailContext.location,
    trialStartsAt: reservation.trial_starts_at,
    trialEndsAt: reservation.trial_ends_at,
    cancelUrl: buildCancelUrl(reservation.cancel_token),
  };
}

export async function runTrialReservationReminderJob(
  now = new Date()
): Promise<TrialReservationReminderRunResult> {
  const admin = createSupabaseAdmin();
  const { windowStart, windowEnd } = buildReminderWindow(now);

  const { data: reservations, error } = await admin
    .from("trial_reservations")
    .select("id,course_id,first_name,last_name,email,is_simulation,trial_starts_at,trial_ends_at,cancel_token,reminder_sent_at")
    .is("cancelled_at", null)
    .is("reminder_sent_at", null)
    .gte("trial_starts_at", windowStart)
    .lte("trial_starts_at", windowEnd)
    .order("trial_starts_at", { ascending: true })
    .returns<TrialReservationReminderRow[]>();

  if (error) {
    logReminderError("load-due-reservations", error, { windowStart, windowEnd });
    throw error;
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const reservation of reservations ?? []) {
    if (reservation.is_simulation) {
      skipped += 1;
      continue;
    }

    const mailContext = await loadMailContext(admin, reservation.course_id);
    const payload = toEmailPayload(reservation, mailContext);

    if (!payload) {
      skipped += 1;
      logReminderError("skip-invalid-reservation", null, { reservationId: reservation.id });
      continue;
    }

    try {
      await sendTrialReservationReminderEmail(payload);
    } catch (sendError) {
      failed += 1;
      logReminderError("send-reminder-email", sendError, { reservationId: reservation.id });
      continue;
    }

    const { error: updateError } = await admin
      .from("trial_reservations")
      .update({ reminder_sent_at: new Date().toISOString() })
      .eq("id", reservation.id)
      .is("reminder_sent_at", null);

    if (updateError) {
      failed += 1;
      logReminderError("mark-reminder-sent", updateError, { reservationId: reservation.id });
      continue;
    }

    sent += 1;
  }

  return {
    processed: reservations?.length ?? 0,
    sent,
    skipped,
    failed,
    windowStart,
    windowEnd,
  };
}
