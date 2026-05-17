import "server-only";

import { randomBytes } from "crypto";
import { getProviderDisplayName, getWorkshopStornoPolicyLabel } from "@/lib/provider-profiles";
import {
  simulateWorkshopPaymentSuccess,
} from "@/lib/payments/simulation/workshop-simulation";
import { sendResendEmail } from "@/lib/resend";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { issueWorkshopTicketForBooking } from "@/lib/tickets";
import { prepareWorkshopCustomerBookingConfirmation } from "@/lib/workshop-booking-emails";
import {
  createSimulationKey,
  createTestBookingSimulationMetadata,
  ensureSimulationEmail,
  type TestBookingSimulationScenario,
} from "@/lib/payments/simulation/test-booking-metadata";

const INTERNAL_SIMULATION_PROVIDER = "internal_simulation";
const WORKSHOP_SCENARIO: TestBookingSimulationScenario = "workshop_test_booking";

type WorkshopCourseRow = {
  id: string;
  title: string | null;
  kind: string | null;
  offer_type: string | null;
  archived_at: string | null;
  teacher_id: string | null;
  instructor_name: string | null;
  location: string | null;
  location_details: string | null;
  workshop_storno_policy: string | null;
  price_cents: number | null;
  currency: string | null;
};

type WorkshopSessionRow = {
  starts_at: string | null;
  ends_at: string | null;
};

type ProfileRow = {
  first_name: string | null;
  last_name: string | null;
  provider_type: "independent_teacher" | "studio_provider" | null;
  organization_name: string | null;
  photo_url: string | null;
};

type BookingInsertRow = {
  id: string;
};

type WorkshopMailContext = {
  providerType: "independent_teacher" | "studio_provider" | null;
  providerName: string | null;
  teacherName: string | null;
  teacherEmail: string | null;
  senderDisplayName: string | null;
  senderImageUrl: string | null;
};

type WorkshopSimulationErrorCode =
  | "missing_course_id"
  | "missing_first_name"
  | "missing_last_name"
  | "invalid_email"
  | "invalid_mail_recipient"
  | "course_not_found"
  | "course_archived"
  | "course_not_supported"
  | "duplicate_open_simulation"
  | "booking_insert_failed"
  | "mail_send_failed";

export class WorkshopSimulationError extends Error {
  code: WorkshopSimulationErrorCode;

  constructor(code: WorkshopSimulationErrorCode, message: string) {
    super(message);
    this.name = "WorkshopSimulationError";
    this.code = code;
  }
}

export type SimulateWorkshopBookingInput = {
  courseId: string;
  firstName: string;
  lastName: string;
  email: string;
  amountCents?: number | null;
  simulatePayment?: boolean;
  sendTestMail?: boolean;
  testMailRecipient?: string | null;
  adminUserId: string;
};

export type SimulateWorkshopBookingResult = {
  bookingId: string;
  courseId: string;
  ticketId: string;
  ticketQrToken: string;
  paymentSimulated: boolean;
  mailSent: boolean;
  mailError: string | null;
  participantsHref: string;
  courseDetailHref: string;
};

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function makeAttendeeKey() {
  return randomBytes(16).toString("hex");
}

function markSimulationName(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "[TEST]";
  return trimmed.startsWith("[TEST]") ? trimmed : `[TEST] ${trimmed}`;
}

function getCustomerName(firstName: string, lastName: string): string {
  return `${markSimulationName(firstName)} ${lastName.trim()}`.trim();
}

function normalizeAmountCents(inputAmount: number | null | undefined, fallbackAmount: number | null | undefined): number {
  if (typeof inputAmount === "number" && Number.isFinite(inputAmount)) {
    return Math.max(0, Math.round(inputAmount));
  }

  if (typeof fallbackAmount === "number" && Number.isFinite(fallbackAmount)) {
    return Math.max(0, Math.round(fallbackAmount));
  }

  return 0;
}

function formatPrice(priceCents: number | null, currency: string | null): string | null {
  if (priceCents === null || !Number.isFinite(priceCents)) return null;
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: currency?.trim().toUpperCase() || "EUR",
  }).format(priceCents / 100);
}

function formatSessionLine(startsAt: string | null, endsAt: string | null): string {
  if (!startsAt) return "Termin folgt";

  const start = new Date(startsAt);
  const date = start.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const startTime = start.toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (!endsAt) return `${date} | ${startTime}`;

  const end = new Date(endsAt);
  const endTime = end.toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return `${date} | ${startTime}-${endTime}`;
}

async function loadCourse(courseId: string): Promise<WorkshopCourseRow> {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("courses")
    .select("id,title,kind,offer_type,archived_at,teacher_id,instructor_name,location,location_details,workshop_storno_policy,price_cents,currency")
    .eq("id", courseId)
    .maybeSingle<WorkshopCourseRow>();

  if (error || !data) {
    throw new WorkshopSimulationError("course_not_found", "Angebot fuer Workshop-Testbuchung nicht gefunden.");
  }

  if (data.archived_at) {
    throw new WorkshopSimulationError("course_archived", "Archivierte Angebote koennen nicht fuer Workshop-Testbuchungen verwendet werden.");
  }

  const offerKind = data.offer_type ?? data.kind;
  if (offerKind !== "workshop" && offerKind !== "exclusive_offer") {
    throw new WorkshopSimulationError("course_not_supported", "Workshop-Testbuchungen sind nur fuer einmalige Angebote verfuegbar.");
  }

  return data;
}

async function assertNoOpenSimulationDuplicate(courseId: string, email: string) {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("bookings")
    .select("id")
    .eq("course_id", courseId)
    .eq("customer_email", email)
    .eq("is_simulation", true)
    .is("archived_at", null)
    .is("refunded_at", null)
    .not("status", "in", '("cancelled","refunded")')
    .maybeSingle<{ id: string }>();

  if (error) {
    throw new WorkshopSimulationError("booking_insert_failed", "Bestehende Workshop-Simulationen konnten nicht geprueft werden.");
  }

  if (data) {
    throw new WorkshopSimulationError(
      "duplicate_open_simulation",
      "Fuer dieses Angebot existiert bereits eine offene Workshop-Testbuchung mit derselben Test-E-Mail."
    );
  }
}

async function loadWorkshopMailContext(course: WorkshopCourseRow): Promise<WorkshopMailContext> {
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
    providerType,
    providerName,
    teacherName: course.instructor_name ?? teacherName,
    teacherEmail,
    senderDisplayName,
    senderImageUrl,
  };
}

async function loadWorkshopSessions(courseId: string): Promise<WorkshopSessionRow[]> {
  const admin = createSupabaseAdmin();
  const { data } = await admin
    .from("course_sessions")
    .select("starts_at,ends_at")
    .eq("course_id", courseId)
    .order("starts_at", { ascending: true })
    .returns<WorkshopSessionRow[]>();

  return data ?? [];
}

async function sendWorkshopSimulationMail(input: {
  bookingId: string;
  course: WorkshopCourseRow;
  customerName: string;
  actualRecipientEmail: string;
  sessionLines: string[];
  paymentStatus: "paid" | "free";
  qrToken: string;
}) {
  const mailContext = await loadWorkshopMailContext(input.course);
  const email = await prepareWorkshopCustomerBookingConfirmation({
    bookingId: input.bookingId,
    workshopTitle: input.course.title ?? "Angebot",
    providerType: mailContext.providerType,
    providerName: mailContext.providerName,
    teacherName: mailContext.teacherName,
    teacherEmail: mailContext.teacherEmail,
    senderDisplayName: mailContext.senderDisplayName,
    senderImageUrl: mailContext.senderImageUrl,
    customerName: input.customerName,
    customerEmail: input.actualRecipientEmail,
    location: input.course.location,
    locationDetails: input.course.location_details,
    sessionLines: input.sessionLines,
    stornoPolicyLabel: getWorkshopStornoPolicyLabel(input.course.workshop_storno_policy),
    priceLabel: formatPrice(input.course.price_cents, input.course.currency),
    paymentStatus: input.paymentStatus,
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
    throw new WorkshopSimulationError("mail_send_failed", "Die angeforderte Workshop-Testmail konnte nicht verschickt werden.");
  }
}

export async function simulateWorkshopBooking(
  input: SimulateWorkshopBookingInput
): Promise<SimulateWorkshopBookingResult> {
  const courseId = input.courseId.trim();
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const rawEmail = input.email.trim().toLowerCase();
  const sendTestMail = Boolean(input.sendTestMail);
  const simulatePayment = Boolean(input.simulatePayment);
  const overrideRecipient = input.testMailRecipient?.trim().toLowerCase() || null;

  if (!courseId) {
    throw new WorkshopSimulationError("missing_course_id", "Bitte gib eine gueltige course_id an.");
  }

  if (!firstName) {
    throw new WorkshopSimulationError("missing_first_name", "Bitte gib den Vornamen fuer die Workshop-Testbuchung an.");
  }

  if (!lastName) {
    throw new WorkshopSimulationError("missing_last_name", "Bitte gib den Nachnamen fuer die Workshop-Testbuchung an.");
  }

  if (!rawEmail || !isValidEmail(rawEmail)) {
    throw new WorkshopSimulationError("invalid_email", "Bitte gib eine gueltige E-Mail-Adresse fuer die Workshop-Testbuchung an.");
  }

  const actualMailRecipient = sendTestMail ? overrideRecipient ?? rawEmail : null;
  if (sendTestMail && (!actualMailRecipient || !isValidEmail(actualMailRecipient))) {
    throw new WorkshopSimulationError(
      "invalid_mail_recipient",
      "Wenn Testmail senden aktiv ist, muss eine gueltige Test-E-Mail-Adresse vorhanden sein."
    );
  }

  const storedSimulationEmail = ensureSimulationEmail(rawEmail);
  const course = await loadCourse(courseId);
  await assertNoOpenSimulationDuplicate(courseId, storedSimulationEmail);

  const amountCents = normalizeAmountCents(input.amountCents, course.price_cents);
  const isFreeBooking = amountCents <= 0;
  const shouldSimulatePayment = !isFreeBooking && simulatePayment;
  const customerFirstName = markSimulationName(firstName);
  const customerLastName = lastName;
  const customerName = getCustomerName(firstName, lastName);
  const attendeeKey = makeAttendeeKey();
  const acceptedAt = new Date().toISOString();
  const simulationKey = createSimulationKey({
    scenario: WORKSHOP_SCENARIO,
    courseId,
    email: storedSimulationEmail,
    qualifier: shouldSimulatePayment ? `paid-${amountCents}` : isFreeBooking ? "free" : `pending-${amountCents}`,
  });
  const simulationMetadata = {
    ...createTestBookingSimulationMetadata({
      scenario: WORKSHOP_SCENARIO,
      triggeredByAdminUserId: input.adminUserId,
    }),
    simulate_payment: shouldSimulatePayment,
    send_test_mail: sendTestMail,
    stored_customer_email: storedSimulationEmail,
    actual_test_mail_recipient: actualMailRecipient,
    amount_cents: amountCents,
    currency: (course.currency ?? "EUR").trim().toUpperCase() || "EUR",
    course_id: courseId,
  };

  const initialStatus = isFreeBooking ? "paid" : shouldSimulatePayment ? "pending" : "pending";
  const initialPaymentStatus = isFreeBooking ? "free" : "pending";
  const initialPaymentProvider = isFreeBooking ? "free" : INTERNAL_SIMULATION_PROVIDER;

  const admin = createSupabaseAdmin();
  const { data: inserted, error: insertError } = await admin
    .from("bookings")
    .insert({
      course_id: courseId,
      attendee_key: attendeeKey,
      status: initialStatus,
      payment_provider: initialPaymentProvider,
      payment_status: initialPaymentStatus,
      customer_first_name: customerFirstName,
      customer_last_name: customerLastName,
      customer_email: storedSimulationEmail,
      customer_phone: null,
      agb_accepted_at: acceptedAt,
      privacy_accepted_at: acceptedAt,
      workshop_storno_terms_accepted_at: acceptedAt,
      is_simulation: true,
      simulation_key: simulationKey,
      simulation_metadata: simulationMetadata,
    })
    .select("id")
    .single<BookingInsertRow>();

  if (insertError || !inserted) {
    throw new WorkshopSimulationError("booking_insert_failed", "Die Workshop-Testbuchung konnte nicht gespeichert werden.");
  }

  let paymentSimulated = false;
  if (shouldSimulatePayment) {
    await simulateWorkshopPaymentSuccess({
      bookingId: inserted.id,
      adminUserId: input.adminUserId,
      amountCents,
      currency: course.currency,
      scenarioNote: "admin_test_bookings_workshop_booking",
    });
    paymentSimulated = true;
  }

  const { ticket } = await issueWorkshopTicketForBooking({
    bookingId: inserted.id,
    courseId,
    customerName,
    customerEmail: storedSimulationEmail,
  });

  const sessions = await loadWorkshopSessions(courseId);
  const sessionLines =
    sessions.length > 0 ? sessions.map((session) => formatSessionLine(session.starts_at, session.ends_at)) : [];

  let mailSent = false;
  let mailError: string | null = null;
  if (actualMailRecipient) {
    try {
      await sendWorkshopSimulationMail({
        bookingId: inserted.id,
        course,
        customerName,
        actualRecipientEmail: actualMailRecipient,
        sessionLines,
        paymentStatus: isFreeBooking ? "free" : "paid",
        qrToken: ticket.qr_token,
      });

      const { error: updateError } = await admin
        .from("bookings")
        .update({ workshop_confirmation_email_sent_at: new Date().toISOString() })
        .eq("id", inserted.id)
        .eq("is_simulation", true);

      if (updateError) {
        mailError = "Testmail wurde gesendet, aber workshop_confirmation_email_sent_at konnte nicht gespeichert werden.";
      } else {
        mailSent = true;
      }
    } catch (error) {
      mailError =
        error instanceof WorkshopSimulationError
          ? error.message
          : "Die angeforderte Workshop-Testmail konnte nicht verschickt werden.";
    }
  }

  return {
    bookingId: inserted.id,
    courseId,
    ticketId: ticket.id,
    ticketQrToken: ticket.qr_token,
    paymentSimulated,
    mailSent,
    mailError,
    participantsHref: "/dashboard/participants",
    courseDetailHref: `/dashboard/courses/${courseId}`,
  };
}
