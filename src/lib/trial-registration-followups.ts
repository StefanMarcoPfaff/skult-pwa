import {
  sendTrialRegistrationExpiredEmail,
  sendTrialRegistrationReminder24hEmail,
  sendTrialRegistrationReminder48hEmail,
  sendTrialRegistrationReminder72hEmail,
  type TrialRegistrationDecisionEmailData,
} from "@/lib/trial-reservation-emails";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

type TrialRegistrationFollowupRow = {
  id: string;
  course_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  decision_status: string | null;
  registration_token: string | null;
  registration_expires_at: string | null;
  decision_taken_at: string | null;
  registration_reminder_24h_sent_at: string | null;
  registration_reminder_48h_sent_at: string | null;
  registration_reminder_72h_sent_at: string | null;
  registration_expired_email_sent_at: string | null;
};

type CourseRow = {
  id: string;
  title: string | null;
};

type SupabaseLikeError = {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
};

type FollowupSkippedReasons = {
  missing_email: number;
  already_converted: number;
  missing_course: number;
};

export type TrialRegistrationFollowupRunResult = {
  eligibleCount: number;
  reminder24hSentCount: number;
  reminder48hSentCount: number;
  reminder72hSentCount: number;
  expirySentCount: number;
  skippedAlreadyConvertedCount: number;
  skippedReasons: FollowupSkippedReasons;
  failuresCount: number;
  scannedCandidateCount: number;
  updatedReservationCount: number;
  now: string;
};

/*
 * MVP note:
 * The final binding registration completion flow is not implemented yet.
 * For now an approved trial counts as "unconverted" until a future real registration step clears/replaces the token flow.
 */

function isDev(): boolean {
  return process.env.NODE_ENV !== "production";
}

function logFollowupInfo(message: string, payload: Record<string, unknown>) {
  if (!isDev()) return;
  console.log("[trial registration followup]", message, payload);
}

function logFollowupError(context: string, error: unknown, extra?: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production") return;
  const supabaseError = (error ?? {}) as SupabaseLikeError;
  console.error("[trial registration followup]", {
    context,
    message: supabaseError.message,
    code: supabaseError.code,
    details: supabaseError.details,
    hint: supabaseError.hint,
    ...extra,
  });
}

function getSiteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
}

function buildRegistrationUrl(registrationToken: string): string {
  return `${getSiteUrl()}/trial/register/${registrationToken}`;
}

function buildCoursesOverviewUrl(): string {
  return `${getSiteUrl()}/courses`;
}

function getCustomerName(reservation: TrialRegistrationFollowupRow): string {
  return [reservation.first_name, reservation.last_name].filter(Boolean).join(" ").trim() || "du";
}

async function loadCourse(admin: ReturnType<typeof createSupabaseAdmin>, courseId: string) {
  const { data: course, error } = await admin
    .from("courses")
    .select("id,title")
    .eq("id", courseId)
    .maybeSingle<CourseRow>();

  if (error || !course) {
    logFollowupError("load-course", error, { courseId });
    return null;
  }

  return course;
}

function hasReachedHoursSinceDecision(value: string | null, hours: number, now: Date): boolean {
  if (!value) return false;
  const decisionDate = new Date(value);
  if (Number.isNaN(decisionDate.getTime())) return false;
  return decisionDate.getTime() <= now.getTime() - hours * 60 * 60 * 1000;
}

function isExpired(value: string | null, now: Date): boolean {
  if (!value) return false;
  const expiresAt = new Date(value);
  if (Number.isNaN(expiresAt.getTime())) return false;
  return expiresAt.getTime() <= now.getTime();
}

function isApprovedTrialReservationConverted(): boolean {
  return false;
}

function buildDecisionEmailData(
  reservation: TrialRegistrationFollowupRow,
  courseTitle: string
): TrialRegistrationDecisionEmailData | null {
  if (!reservation.email) return null;

  return {
    reservationId: reservation.id,
    courseTitle,
    customerName: getCustomerName(reservation),
    customerEmail: reservation.email,
    registrationUrl: reservation.registration_token ? buildRegistrationUrl(reservation.registration_token) : undefined,
    registrationExpiresAt: reservation.registration_expires_at ?? undefined,
  };
}

async function markSent(
  admin: ReturnType<typeof createSupabaseAdmin>,
  reservationId: string,
  field: string
): Promise<boolean> {
  const { error } = await admin
    .from("trial_reservations")
    .update({ [field]: new Date().toISOString() })
    .eq("id", reservationId)
    .is(field, null);

  if (error) {
    logFollowupError("mark-sent", error, { reservationId, field });
    return false;
  }

  return true;
}

export async function runTrialRegistrationFollowupJob(
  now = new Date()
): Promise<TrialRegistrationFollowupRunResult> {
  const admin = createSupabaseAdmin();
  const nowIso = now.toISOString();

  logFollowupInfo("started", { now: nowIso });

  const { data: reservations, error } = await admin
    .from("trial_reservations")
    .select(
      `
      id,
      course_id,
      first_name,
      last_name,
      email,
      decision_status,
      registration_token,
      registration_expires_at,
      decision_taken_at,
      registration_reminder_24h_sent_at,
      registration_reminder_48h_sent_at,
      registration_reminder_72h_sent_at,
      registration_expired_email_sent_at
      `
    )
    .eq("decision_status", "approved")
    .not("registration_token", "is", null)
    .not("registration_expires_at", "is", null)
    .returns<TrialRegistrationFollowupRow[]>();

  if (error) {
    logFollowupError("load-approved-reservations", error, { now: nowIso });
    throw error;
  }

  const summary: TrialRegistrationFollowupRunResult = {
    eligibleCount: 0,
    reminder24hSentCount: 0,
    reminder48hSentCount: 0,
    reminder72hSentCount: 0,
    expirySentCount: 0,
    skippedAlreadyConvertedCount: 0,
    skippedReasons: {
      missing_email: 0,
      already_converted: 0,
      missing_course: 0,
    },
    failuresCount: 0,
    scannedCandidateCount: reservations?.length ?? 0,
    updatedReservationCount: 0,
    now: nowIso,
  };

  logFollowupInfo("candidates loaded", { scannedCandidateCount: summary.scannedCandidateCount });

  for (const reservation of reservations ?? []) {
    if (isApprovedTrialReservationConverted()) {
      summary.skippedAlreadyConvertedCount += 1;
      summary.skippedReasons.already_converted += 1;
      continue;
    }

    const course = await loadCourse(admin, reservation.course_id);
    if (!course) {
      summary.skippedReasons.missing_course += 1;
      continue;
    }

    const emailData = buildDecisionEmailData(reservation, course.title ?? "Kurs");
    if (!emailData || !reservation.email) {
      summary.skippedReasons.missing_email += 1;
      continue;
    }

    summary.eligibleCount += 1;

    try {
      if (
        isExpired(reservation.registration_expires_at, now) &&
        !reservation.registration_expired_email_sent_at
      ) {
        await sendTrialRegistrationExpiredEmail({
          ...emailData,
          coursesOverviewUrl: buildCoursesOverviewUrl(),
        });

        if (await markSent(admin, reservation.id, "registration_expired_email_sent_at")) {
          summary.expirySentCount += 1;
          summary.updatedReservationCount += 1;
          logFollowupInfo("expiry sent", { reservationId: reservation.id });
        } else {
          summary.failuresCount += 1;
        }
        continue;
      }

      if (
        hasReachedHoursSinceDecision(reservation.decision_taken_at, 72, now) &&
        !reservation.registration_reminder_72h_sent_at
      ) {
        await sendTrialRegistrationReminder72hEmail(emailData);
        if (await markSent(admin, reservation.id, "registration_reminder_72h_sent_at")) {
          summary.reminder72hSentCount += 1;
          summary.updatedReservationCount += 1;
          logFollowupInfo("72h sent", { reservationId: reservation.id });
        } else {
          summary.failuresCount += 1;
        }
        continue;
      }

      if (
        hasReachedHoursSinceDecision(reservation.decision_taken_at, 48, now) &&
        !reservation.registration_reminder_48h_sent_at
      ) {
        await sendTrialRegistrationReminder48hEmail(emailData);
        if (await markSent(admin, reservation.id, "registration_reminder_48h_sent_at")) {
          summary.reminder48hSentCount += 1;
          summary.updatedReservationCount += 1;
          logFollowupInfo("48h sent", { reservationId: reservation.id });
        } else {
          summary.failuresCount += 1;
        }
        continue;
      }

      if (
        hasReachedHoursSinceDecision(reservation.decision_taken_at, 24, now) &&
        !reservation.registration_reminder_24h_sent_at
      ) {
        await sendTrialRegistrationReminder24hEmail(emailData);
        if (await markSent(admin, reservation.id, "registration_reminder_24h_sent_at")) {
          summary.reminder24hSentCount += 1;
          summary.updatedReservationCount += 1;
          logFollowupInfo("24h sent", { reservationId: reservation.id });
        } else {
          summary.failuresCount += 1;
        }
      }
    } catch (sendError) {
      summary.failuresCount += 1;
      logFollowupError("send-followup-email", sendError, { reservationId: reservation.id });
    }
  }

  logFollowupInfo("finished", summary);
  return summary;
}
