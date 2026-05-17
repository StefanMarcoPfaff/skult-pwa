import "server-only";

import { randomBytes } from "crypto";
import { buildTrialSlot, computeUpcomingTrialSlots, type TrialSlot } from "@/app/courses/[id]/trial-slots";
import { getProviderDisplayName } from "@/lib/provider-profiles";
import { sendResendEmail } from "@/lib/resend";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { issueTrialTicketForReservation } from "@/lib/tickets";
import { prepareCustomerTrialReservationConfirmation } from "@/lib/trial-reservation-emails";
import {
  createSimulationKey,
  createTestBookingSimulationMetadata,
  ensureSimulationEmail,
  type TestBookingSimulationScenario,
} from "@/lib/payments/simulation/test-booking-metadata";

type CourseTrialSimulationRow = {
  id: string;
  title: string | null;
  location: string | null;
  teacher_id: string | null;
  kind: string | null;
  weekday: number | null;
  start_time: string | null;
  duration_minutes: number | null;
  recurrence_type: string | null;
  trial_mode: string | null;
  starts_at: string | null;
  ends_at: string | null;
  archived_at: string | null;
};

type TrialSlotLookupRow = {
  id: string;
  course_id: string;
  starts_at: string | null;
  ends_at: string | null;
  is_open: boolean | null;
};

type TrialReservationInsertRow = {
  id: string;
};

type ProfileRow = {
  first_name: string | null;
  last_name: string | null;
  provider_type: "independent_teacher" | "studio_provider" | null;
  organization_name: string | null;
  photo_url: string | null;
};

type TrialMailContext = {
  courseTitle: string;
  location: string | null;
  teacherName: string | null;
  teacherEmail: string | null;
  providerType: "independent_teacher" | "studio_provider" | null;
  providerName: string | null;
  senderDisplayName: string | null;
  senderImageUrl: string | null;
};

type TrialSimulationErrorCode =
  | "missing_course_id"
  | "missing_first_name"
  | "missing_last_name"
  | "invalid_email"
  | "invalid_mail_override"
  | "course_not_found"
  | "course_not_supported"
  | "course_archived"
  | "slot_not_found"
  | "slot_invalid"
  | "slot_missing"
  | "duplicate_open_simulation"
  | "reservation_insert_failed"
  | "mail_context_missing"
  | "mail_send_failed";

export class TrialSimulationError extends Error {
  code: TrialSimulationErrorCode;

  constructor(code: TrialSimulationErrorCode, message: string) {
    super(message);
    this.name = "TrialSimulationError";
    this.code = code;
  }
}

export type CreateTrialTestBookingInput = {
  courseId: string;
  firstName: string;
  lastName: string;
  email: string;
  trialSlotId?: string | null;
  sendTestMail?: boolean;
  testMailRecipientOverride?: string | null;
  adminUserId: string;
};

export type CreateTrialTestBookingResult = {
  reservationId: string;
  ticketId: string;
  ticketQrToken: string;
  mailSent: boolean;
  mailError: string | null;
  participantsHref: string;
};

const TRIAL_SCENARIO: TestBookingSimulationScenario = "trial_test_booking";

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function generateCancelToken(): string {
  return randomBytes(24).toString("hex");
}

function markSimulationName(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "[TEST]";
  return trimmed.startsWith("[TEST]") ? trimmed : `[TEST] ${trimmed}`;
}

function getParticipantDisplayName(firstName: string, lastName: string): string {
  return `${markSimulationName(firstName)} ${lastName.trim()}`.trim();
}

async function loadCourse(courseId: string): Promise<CourseTrialSimulationRow> {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("courses")
    .select("id,title,location,teacher_id,kind,weekday,start_time,duration_minutes,recurrence_type,trial_mode,starts_at,ends_at,archived_at")
    .eq("id", courseId)
    .maybeSingle<CourseTrialSimulationRow>();

  if (error || !data) {
    throw new TrialSimulationError("course_not_found", "Angebot fuer Trial-Testbuchung nicht gefunden.");
  }

  if (data.archived_at) {
    throw new TrialSimulationError("course_archived", "Archivierte Angebote koennen nicht fuer Trial-Testbuchungen verwendet werden.");
  }

  if (data.kind !== "course") {
    throw new TrialSimulationError("course_not_supported", "Trial-Testbuchungen sind nur fuer laufende Angebote verfuegbar.");
  }

  return data;
}

async function loadManualTrialSlot(courseId: string, trialSlotId: string): Promise<TrialSlot> {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("trial_slots")
    .select("id,course_id,starts_at,ends_at,is_open")
    .eq("id", trialSlotId)
    .eq("course_id", courseId)
    .eq("is_open", true)
    .maybeSingle<TrialSlotLookupRow>();

  if (error || !data) {
    throw new TrialSimulationError("slot_not_found", "Der angegebene trial_slot_id wurde nicht gefunden oder ist nicht offen.");
  }

  const slot = buildTrialSlot(String(data.starts_at ?? ""), String(data.ends_at ?? ""));
  if (!slot) {
    throw new TrialSimulationError("slot_invalid", "Der angegebene Trial-Slot ist fachlich ungueltig.");
  }

  return slot;
}

async function selectTrialSlot(course: CourseTrialSimulationRow, trialSlotId?: string | null): Promise<TrialSlot> {
  if (trialSlotId) {
    return loadManualTrialSlot(course.id, trialSlotId);
  }

  if ((course.trial_mode ?? "all_sessions") === "manual") {
    const admin = createSupabaseAdmin();
    const { data, error } = await admin
      .from("trial_slots")
      .select("id,course_id,starts_at,ends_at,is_open")
      .eq("course_id", course.id)
      .eq("is_open", true)
      .gte("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true })
      .limit(1)
      .returns<TrialSlotLookupRow[]>();

    if (error) {
      throw new TrialSimulationError("slot_missing", "Offene Trial-Slots konnten nicht geladen werden.");
    }

    const slot = data?.[0] ? buildTrialSlot(String(data[0].starts_at ?? ""), String(data[0].ends_at ?? "")) : null;
    if (!slot) {
      throw new TrialSimulationError("slot_missing", "Aktuell ist kein offener Trial-Slot fuer dieses Angebot verfuegbar.");
    }

    return slot;
  }

  const computed = computeUpcomingTrialSlots({
    weekday: course.weekday,
    startTime: course.start_time,
    durationMinutes: course.duration_minutes,
    recurrenceType: course.recurrence_type,
    trialMode: course.trial_mode,
    startsAt: course.starts_at,
  });

  const selected = computed[0];
  if (!selected) {
    throw new TrialSimulationError("slot_missing", "Aktuell ist kein berechenbarer Trial-Slot fuer dieses Angebot verfuegbar.");
  }

  return selected;
}

async function assertNoOpenSimulationDuplicate(courseId: string, email: string) {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("trial_reservations")
    .select("id")
    .eq("course_id", courseId)
    .eq("email", email)
    .eq("is_simulation", true)
    .is("cancelled_at", null)
    .is("archived_at", null)
    .maybeSingle<{ id: string }>();

  if (error) {
    throw new TrialSimulationError("reservation_insert_failed", "Die vorhandenen Trial-Simulationen konnten nicht geprueft werden.");
  }

  if (data) {
    throw new TrialSimulationError(
      "duplicate_open_simulation",
      "Fuer dieses Angebot existiert bereits eine offene Trial-Testbuchung mit derselben Test-E-Mail."
    );
  }
}

async function loadTrialMailContext(course: CourseTrialSimulationRow): Promise<TrialMailContext | null> {
  const admin = createSupabaseAdmin();

  let teacherName: string | null = null;
  let teacherEmail: string | null = null;
  let providerType: "independent_teacher" | "studio_provider" | null = null;
  let providerName: string | null = null;
  let senderDisplayName: string | null = null;
  let senderImageUrl: string | null = null;

  if (course.teacher_id) {
    const [{ data: profile }, authResult] = await Promise.all([
      admin
        .from("profiles")
        .select("first_name,last_name,provider_type,organization_name,photo_url")
        .eq("id", course.teacher_id)
        .maybeSingle<ProfileRow>(),
      admin.auth.admin.getUserById(course.teacher_id),
    ]);

    const nameParts = [profile?.first_name, profile?.last_name].filter(Boolean);
    teacherName = nameParts.length > 0 ? nameParts.join(" ") : null;
    teacherEmail = authResult.data.user?.email ?? null;
    providerType = profile?.provider_type ?? null;
    providerName = profile?.provider_type ? getProviderDisplayName(profile.provider_type, profile) : null;
    senderDisplayName = providerType === "studio_provider" ? providerName : teacherName;
    senderImageUrl = profile?.photo_url ?? null;
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
  };
}

async function sendSimulationTrialConfirmationEmail(input: {
  reservationId: string;
  course: CourseTrialSimulationRow;
  customerName: string;
  actualRecipientEmail: string;
  trialStartsAt: string;
  trialEndsAt: string;
  cancelToken: string;
  qrToken: string;
}) {
  const mailContext = await loadTrialMailContext(input.course);
  if (!mailContext) {
    throw new TrialSimulationError("mail_context_missing", "Mail-Kontext fuer die Trial-Testbuchung konnte nicht geladen werden.");
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const cancelUrl = `${siteUrl}/trial/cancel/${input.cancelToken}`;
  const email = await prepareCustomerTrialReservationConfirmation({
    reservationId: input.reservationId,
    courseTitle: mailContext.courseTitle,
    providerType: mailContext.providerType,
    providerName: mailContext.providerName,
    teacherName: mailContext.teacherName,
    teacherEmail: mailContext.teacherEmail,
    senderDisplayName: mailContext.senderDisplayName,
    senderImageUrl: mailContext.senderImageUrl,
    customerName: input.customerName,
    customerEmail: input.actualRecipientEmail,
    location: mailContext.location,
    trialStartsAt: input.trialStartsAt,
    trialEndsAt: input.trialEndsAt,
    cancelUrl,
    qrToken: input.qrToken,
  });

  const htmlNotice =
    '<div style="margin: 0 0 18px; padding: 12px 14px; border: 1px solid #f59e0b; border-radius: 12px; background: #fffbeb; color: #92400e; font-weight: 700;">TESTMAIL: Diese Nachricht stammt aus einer internen RESER-Simulation.</div>';
  const textNotice = "TESTMAIL: Diese Nachricht stammt aus einer internen RESER-Simulation.\n\n";

  try {
    const result = await sendResendEmail({
      to: input.actualRecipientEmail,
      subject: `[TEST] ${email.subject}`,
      html: `${htmlNotice}${email.html}`,
      text: `${textNotice}${email.text}`,
    });

    if (result?.error) {
      throw result.error;
    }
  } catch {
    throw new TrialSimulationError("mail_send_failed", "Die angeforderte Trial-Testmail konnte nicht verschickt werden.");
  }
}

export async function createTrialTestBooking(
  input: CreateTrialTestBookingInput
): Promise<CreateTrialTestBookingResult> {
  const courseId = input.courseId.trim();
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const rawEmail = input.email.trim().toLowerCase();
  const trialSlotId = input.trialSlotId?.trim() || null;
  const sendTestMail = Boolean(input.sendTestMail);
  const overrideRecipient = input.testMailRecipientOverride?.trim().toLowerCase() || null;

  if (!courseId) {
    throw new TrialSimulationError("missing_course_id", "Bitte gib eine gueltige course_id an.");
  }

  if (!firstName) {
    throw new TrialSimulationError("missing_first_name", "Bitte gib den Vornamen fuer die Trial-Testbuchung an.");
  }

  if (!lastName) {
    throw new TrialSimulationError("missing_last_name", "Bitte gib den Nachnamen fuer die Trial-Testbuchung an.");
  }

  if (!rawEmail || !isValidEmail(rawEmail)) {
    throw new TrialSimulationError("invalid_email", "Bitte gib eine gueltige E-Mail-Adresse fuer die Trial-Testbuchung an.");
  }

  const actualMailRecipient = sendTestMail ? overrideRecipient ?? rawEmail : null;
  if (sendTestMail && (!actualMailRecipient || !isValidEmail(actualMailRecipient))) {
    throw new TrialSimulationError(
      "invalid_mail_override",
      "Wenn Testmail senden aktiv ist, muss eine gueltige Ziel-E-Mail vorhanden sein."
    );
  }

  const storedSimulationEmail = ensureSimulationEmail(rawEmail);
  const course = await loadCourse(courseId);
  const selectedSlot = await selectTrialSlot(course, trialSlotId);
  await assertNoOpenSimulationDuplicate(courseId, storedSimulationEmail);

  const simulationKey = createSimulationKey({
    scenario: TRIAL_SCENARIO,
    courseId,
    email: storedSimulationEmail,
    qualifier: trialSlotId ?? selectedSlot.startsAt,
  });
  const simulationMetadata = {
    ...createTestBookingSimulationMetadata({
      scenario: TRIAL_SCENARIO,
      triggeredByAdminUserId: input.adminUserId,
    }),
    mail_requested: sendTestMail,
    mail_recipient_override: actualMailRecipient ? overrideRecipient : null,
    course_id: courseId,
    selected_trial_slot_id: trialSlotId,
    selected_trial_starts_at: selectedSlot.startsAt,
    selected_trial_ends_at: selectedSlot.endsAt,
    stored_customer_email: storedSimulationEmail,
  };
  const customerFirstName = markSimulationName(firstName);
  const customerLastName = lastName;
  const customerName = getParticipantDisplayName(firstName, lastName);
  const cancelToken = generateCancelToken();

  const admin = createSupabaseAdmin();
  const { data: inserted, error: insertError } = await admin
    .from("trial_reservations")
    .insert({
      course_id: courseId,
      first_name: customerFirstName,
      last_name: customerLastName,
      email: storedSimulationEmail,
      status: "pending",
      decision_status: "pending",
      user_id: null,
      trial_starts_at: selectedSlot.startsAt,
      trial_ends_at: selectedSlot.endsAt,
      cancel_token: cancelToken,
      is_simulation: true,
      simulation_key: simulationKey,
      simulation_metadata: simulationMetadata,
    })
    .select("id")
    .single<TrialReservationInsertRow>();

  if (insertError || !inserted) {
    throw new TrialSimulationError(
      "reservation_insert_failed",
      "Die Trial-Testbuchung konnte nicht gespeichert werden."
    );
  }

  const { ticket } = await issueTrialTicketForReservation({
    trialReservationId: inserted.id,
    courseId,
    customerName,
    customerEmail: storedSimulationEmail,
  });

  let mailSent = false;
  let mailError: string | null = null;
  if (actualMailRecipient) {
    try {
      await sendSimulationTrialConfirmationEmail({
        reservationId: inserted.id,
        course,
        customerName,
        actualRecipientEmail: actualMailRecipient,
        trialStartsAt: selectedSlot.startsAt,
        trialEndsAt: selectedSlot.endsAt,
        cancelToken,
        qrToken: ticket.qr_token,
      });

      const { error: updateError } = await admin
        .from("trial_reservations")
        .update({ confirmation_sent_at: new Date().toISOString() })
        .eq("id", inserted.id)
        .eq("is_simulation", true);

      if (updateError) {
        mailError = "Testmail wurde gesendet, aber confirmation_sent_at konnte nicht gespeichert werden.";
      } else {
        mailSent = true;
      }
    } catch (error) {
      mailError =
        error instanceof TrialSimulationError
          ? error.message
          : "Die angeforderte Trial-Testmail konnte nicht verschickt werden.";
    }
  }

  return {
    reservationId: inserted.id,
    ticketId: ticket.id,
    ticketQrToken: ticket.qr_token,
    mailSent,
    mailError,
    participantsHref: "/dashboard/participants",
  };
}
