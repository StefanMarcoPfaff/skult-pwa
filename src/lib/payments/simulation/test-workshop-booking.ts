import "server-only";

import { randomBytes } from "crypto";
import { getProviderDisplayName, getWorkshopStornoPolicyLabel } from "@/lib/provider-profiles";
import {
  simulateWorkshopPaymentSuccess,
} from "@/lib/payments/simulation/workshop-simulation";
import { loadCustomerReceiptAttachmentForMail } from "@/lib/documents/financial-document-mail-attachments";
import { sendResendEmail } from "@/lib/resend";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { issueWorkshopTicketForBooking } from "@/lib/tickets";
import {
  prepareWorkshopCustomerBookingConfirmation,
  prepareWorkshopTeacherBookingNotification,
  type WorkshopBookingEmailData,
} from "@/lib/workshop-booking-emails";
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
  status: string | null;
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

type LedgerEntryRow = {
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

type WorkshopSimulationStep =
  | "course_lookup"
  | "booking_insert"
  | "ticket_create"
  | "payment_simulation"
  | "test_mail";

export class WorkshopSimulationError extends Error {
  code: WorkshopSimulationErrorCode;
  step: WorkshopSimulationStep;
  courseFound: boolean | null;
  courseKind: string | null;
  courseStatus: string | null;
  archivedAt: string | null;
  supabaseMessage: string | null;
  supabaseCode: string | null;
  duplicateBookingId: string | null;

  constructor(input: {
    code: WorkshopSimulationErrorCode;
    message: string;
    step: WorkshopSimulationStep;
    courseFound?: boolean | null;
    courseKind?: string | null;
    courseStatus?: string | null;
    archivedAt?: string | null;
    supabaseMessage?: string | null;
    supabaseCode?: string | null;
    duplicateBookingId?: string | null;
  }) {
    super(input.message);
    this.name = "WorkshopSimulationError";
    this.code = input.code;
    this.step = input.step;
    this.courseFound = input.courseFound ?? null;
    this.courseKind = input.courseKind ?? null;
    this.courseStatus = input.courseStatus ?? null;
    this.archivedAt = input.archivedAt ?? null;
    this.supabaseMessage = input.supabaseMessage ?? null;
    this.supabaseCode = input.supabaseCode ?? null;
    this.duplicateBookingId = input.duplicateBookingId ?? null;
  }
}

export type SimulateWorkshopBookingInput = {
  courseId: string;
  firstName: string;
  lastName: string;
  email: string;
  amountCents?: number | null;
  simulatePayment?: boolean;
  sendCustomerTestMail?: boolean;
  sendProviderTestMail?: boolean;
  customerTestMailRecipient?: string | null;
  providerTestMailRecipient?: string | null;
  adminUserId: string;
};

export type SimulateWorkshopBookingResult = {
  bookingId: string;
  courseId: string;
  ticketId: string;
  ticketQrToken: string;
  bookingCreated: boolean;
  ticketCreated: boolean;
  paymentSimulated: boolean;
  paymentTransactionId: string | null;
  ledgerEntryId: string | null;
  customerReceiptDocumentId: string | null;
  customerReceiptPdfPath: string | null;
  customerReceiptPdfGenerated: boolean;
  customerReceiptPdfWarning: string | null;
  customerMailSent: boolean;
  providerMailSent: boolean;
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

function logWorkshopSimulationLookup(message: string, payload: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production") return;
  console.log("[workshop test simulation]", message, payload);
}

function buildCourseDebugSummary(course: Pick<WorkshopCourseRow, "id" | "kind" | "status" | "archived_at"> | null): string {
  if (!course) {
    return "course_found=no";
  }

  return [
    "course_found=yes",
    `course_id=${course.id}`,
    `status=${course.status ?? "null"}`,
    `type=${course.kind ?? "null"}`,
    `archived_at=${course.archived_at ?? "null"}`,
  ].join(" | ");
}

function logSupabaseStep(message: string, error: { message?: string | null; code?: string | null } | null, extra?: Record<string, unknown>) {
  logWorkshopSimulationLookup(message, {
    supabaseMessage: error?.message ?? null,
    supabaseCode: error?.code ?? null,
    ...extra,
  });
}

async function loadCourse(courseId: string): Promise<WorkshopCourseRow> {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("courses")
    .select("id,title,kind,status,archived_at,teacher_id,instructor_name,location,location_details,workshop_storno_policy,price_cents,currency")
    .eq("id", courseId)
    .maybeSingle<WorkshopCourseRow>();

  logWorkshopSimulationLookup("course lookup result", {
    requestedCourseId: courseId,
    found: Boolean(data),
    errorMessage: error?.message ?? null,
    errorCode: error?.code ?? null,
    kind: data?.kind ?? null,
    status: data?.status ?? null,
    archivedAt: data?.archived_at ?? null,
  });

  if (error || !data) {
    throw new WorkshopSimulationError({
      code: "course_not_found",
      step: "course_lookup",
      message: `Angebot fuer Workshop-Testbuchung nicht gefunden. ${buildCourseDebugSummary(null)}`,
      courseFound: false,
      supabaseMessage: error?.message ?? null,
      supabaseCode: error?.code ?? null,
    });
  }

  if (data.archived_at) {
    throw new WorkshopSimulationError({
      code: "course_archived",
      step: "course_lookup",
      message: `Angebot ist archiviert und kann nicht fuer Workshop-Testbuchungen verwendet werden. ${buildCourseDebugSummary(data)}`,
      courseFound: true,
      courseKind: data.kind,
      courseStatus: data.status,
      archivedAt: data.archived_at,
    });
  }

  const offerKind = String(data.kind ?? "").trim().toLowerCase();
  if (offerKind !== "workshop" && offerKind !== "exclusive_offer") {
    throw new WorkshopSimulationError({
      code: "course_not_supported",
      step: "course_lookup",
      message: `Angebot gefunden, aber Typ ist nicht als einmaliges Angebot geeignet. ${buildCourseDebugSummary(data)}`,
      courseFound: true,
      courseKind: data.kind,
      courseStatus: data.status,
      archivedAt: data.archived_at,
    });
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
    logSupabaseStep("duplicate simulation lookup failed", error, {
      step: "booking_insert",
      courseId,
      email,
    });
    throw new WorkshopSimulationError({
      code: "booking_insert_failed",
      step: "booking_insert",
      message: "Bestehende Workshop-Simulationen konnten nicht geprueft werden.",
      courseFound: true,
      supabaseMessage: error.message ?? null,
      supabaseCode: error.code ?? null,
    });
  }

  if (data) {
    throw new WorkshopSimulationError({
      code: "duplicate_open_simulation",
      step: "booking_insert",
      message:
        "Es existiert bereits eine offene Testbuchung fuer dieses Angebot und diese Test-E-Mail. Verwende eine andere Test-E-Mail oder storniere/archiviere die bestehende Testbuchung.",
      courseFound: true,
      duplicateBookingId: data.id,
    });
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

function buildWorkshopEmailData(input: {
  bookingId: string;
  course: WorkshopCourseRow;
  customerName: string;
  customerEmail: string;
  sessionLines: string[];
  paymentStatus: "paid" | "free";
  qrToken: string;
  mailContext: WorkshopMailContext;
}): WorkshopBookingEmailData {
  return {
    bookingId: input.bookingId,
    workshopTitle: input.course.title ?? "Angebot",
    providerType: input.mailContext.providerType,
    providerName: input.mailContext.providerName,
    teacherName: input.mailContext.teacherName,
    teacherEmail: input.mailContext.teacherEmail,
    senderDisplayName: input.mailContext.senderDisplayName,
    senderImageUrl: input.mailContext.senderImageUrl,
    customerName: input.customerName,
    customerEmail: input.customerEmail,
    location: input.course.location,
    locationDetails: input.course.location_details,
    sessionLines: input.sessionLines,
    stornoPolicyLabel: getWorkshopStornoPolicyLabel(input.course.workshop_storno_policy),
    priceLabel: formatPrice(input.course.price_cents, input.course.currency),
    paymentStatus: input.paymentStatus,
    qrToken: input.qrToken,
  };
}

async function loadPositiveLedgerEntryId(paymentTransactionId: string): Promise<string | null> {
  const admin = createSupabaseAdmin();
  const { data } = await admin
    .from("ledger_entries")
    .select("id")
    .eq("source_type", "payment_transaction")
    .eq("source_id", paymentTransactionId)
    .eq("entry_type", "payment")
    .maybeSingle<LedgerEntryRow>();

  return data?.id ?? null;
}

async function sendWorkshopSimulationCustomerMail(input: {
  emailData: WorkshopBookingEmailData;
  actualRecipientEmail: string;
  paymentTransactionId?: string | null;
}) {
  const email = await prepareWorkshopCustomerBookingConfirmation({
    ...input.emailData,
    customerEmail: input.actualRecipientEmail,
  });

  const htmlNotice =
    '<div style="margin: 0 0 18px; padding: 12px 14px; border: 1px solid #f59e0b; border-radius: 12px; background: #fffbeb; color: #92400e; font-weight: 700;">TESTMAIL: Diese Nachricht stammt aus einer internen RESER-Simulation.</div>';
  const textNotice = "TESTMAIL: Diese Nachricht stammt aus einer internen RESER-Simulation.\n\n";
  const attachments = await loadCustomerReceiptAttachmentForMail({
    context: "workshop_customer_test_booking_confirmation",
    query: {
      bookingId: input.emailData.bookingId,
      paymentTransactionId: input.paymentTransactionId,
    },
  });

  const result = await sendResendEmail({
    to: input.actualRecipientEmail,
    subject: `[TEST] ${email.subject}`,
    html: `${htmlNotice}${email.html}`,
    text: `${textNotice}${email.text}`,
    attachments,
  });

  if (result?.error) {
    throw result.error;
  }
}

async function sendWorkshopSimulationProviderMail(input: {
  emailData: WorkshopBookingEmailData;
  actualRecipientEmail: string;
}) {
  const email = prepareWorkshopTeacherBookingNotification({
    ...input.emailData,
    teacherEmail: input.actualRecipientEmail,
  });

  const htmlNotice =
    '<div style="margin: 0 0 18px; padding: 12px 14px; border: 1px solid #f59e0b; border-radius: 12px; background: #fffbeb; color: #92400e; font-weight: 700;">TESTMAIL: Diese Nachricht stammt aus einer internen RESER-Simulation.</div>';
  const textNotice = "TESTMAIL: Diese Nachricht stammt aus einer internen RESER-Simulation.\n\n";

  const result = await sendResendEmail({
    to: input.actualRecipientEmail,
    subject: `[TEST] ${email.subject}`,
    html: `${htmlNotice}${email.html}`,
    text: `${textNotice}${email.text}`,
  });

  if (result?.error) {
    throw result.error;
  }
}

export async function simulateWorkshopBooking(
  input: SimulateWorkshopBookingInput
): Promise<SimulateWorkshopBookingResult> {
  const courseId = input.courseId.trim();
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const rawEmail = input.email.trim().toLowerCase();
  const sendCustomerTestMail = Boolean(input.sendCustomerTestMail);
  const sendProviderTestMail = Boolean(input.sendProviderTestMail);
  const simulatePayment = Boolean(input.simulatePayment);
  const customerMailOverride = input.customerTestMailRecipient?.trim().toLowerCase() || null;
  const providerMailOverride = input.providerTestMailRecipient?.trim().toLowerCase() || null;

  logWorkshopSimulationLookup("simulate workshop booking input", {
    courseId,
    simulatePayment,
    sendCustomerTestMail,
    sendProviderTestMail,
    hasAmountCents: input.amountCents !== null && input.amountCents !== undefined,
  });

  if (!courseId) {
    throw new WorkshopSimulationError({
      code: "missing_course_id",
      step: "course_lookup",
      message: "Bitte gib eine gueltige course_id an.",
      courseFound: false,
    });
  }

  if (!firstName) {
    throw new WorkshopSimulationError({
      code: "missing_first_name",
      step: "booking_insert",
      message: "Bitte gib den Vornamen fuer die Workshop-Testbuchung an.",
    });
  }

  if (!lastName) {
    throw new WorkshopSimulationError({
      code: "missing_last_name",
      step: "booking_insert",
      message: "Bitte gib den Nachnamen fuer die Workshop-Testbuchung an.",
    });
  }

  if (!rawEmail || !isValidEmail(rawEmail)) {
    throw new WorkshopSimulationError({
      code: "invalid_email",
      step: "booking_insert",
      message: "Bitte gib eine gueltige E-Mail-Adresse fuer die Workshop-Testbuchung an.",
    });
  }

  const actualCustomerMailRecipient = sendCustomerTestMail ? customerMailOverride ?? rawEmail : null;
  if (sendCustomerTestMail && (!actualCustomerMailRecipient || !isValidEmail(actualCustomerMailRecipient))) {
    throw new WorkshopSimulationError({
      code: "invalid_mail_recipient",
      step: "test_mail",
      message: "Wenn Kund*innen-Testmail senden aktiv ist, muss eine gueltige Test-E-Mail-Adresse vorhanden sein.",
    });
  }

  const storedSimulationEmail = ensureSimulationEmail(rawEmail);
  const course = await loadCourse(courseId);
  await assertNoOpenSimulationDuplicate(courseId, storedSimulationEmail);
  const mailContext = await loadWorkshopMailContext(course);

  const actualProviderMailRecipient = sendProviderTestMail
    ? providerMailOverride ?? mailContext.teacherEmail?.trim().toLowerCase() ?? null
    : null;
  if (sendProviderTestMail && (!actualProviderMailRecipient || !isValidEmail(actualProviderMailRecipient))) {
    throw new WorkshopSimulationError({
      code: "invalid_mail_recipient",
      step: "test_mail",
      message:
        "Wenn Anbieter*innen-Testmail senden aktiv ist, muss eine gueltige Anbieter*innen- oder Test-E-Mail-Adresse vorhanden sein.",
      courseFound: true,
      courseKind: course.kind,
      courseStatus: course.status,
      archivedAt: course.archived_at,
    });
  }

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
    send_customer_test_mail: sendCustomerTestMail,
    send_provider_test_mail: sendProviderTestMail,
    stored_customer_email: storedSimulationEmail,
    actual_customer_test_mail_recipient: actualCustomerMailRecipient,
    actual_provider_test_mail_recipient: actualProviderMailRecipient,
    amount_cents: amountCents,
    currency: (course.currency ?? "EUR").trim().toUpperCase() || "EUR",
    course_id: courseId,
  };

  const initialStatus = isFreeBooking ? "paid" : shouldSimulatePayment ? "pending" : "pending";
  const initialPaymentStatus = isFreeBooking ? "free" : "pending";
  const initialPaymentProvider = isFreeBooking ? "free" : INTERNAL_SIMULATION_PROVIDER;

  const admin = createSupabaseAdmin();
  logWorkshopSimulationLookup("booking insert start", {
    courseId,
    amountCents,
    isFreeBooking,
    shouldSimulatePayment,
    storedSimulationEmail,
  });
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
    logSupabaseStep("booking insert failed", insertError, {
      step: "booking_insert",
      courseId,
      kind: course.kind,
      status: course.status,
      archivedAt: course.archived_at,
    });
    throw new WorkshopSimulationError({
      code: "booking_insert_failed",
      step: "booking_insert",
      message: "Die Workshop-Testbuchung konnte nicht gespeichert werden.",
      courseFound: true,
      courseKind: course.kind,
      courseStatus: course.status,
      archivedAt: course.archived_at,
      supabaseMessage: insertError?.message ?? null,
      supabaseCode: insertError?.code ?? null,
    });
  }

  logWorkshopSimulationLookup("booking insert success", {
    bookingId: inserted.id,
    courseId,
  });

  logWorkshopSimulationLookup("ticket create start", {
    bookingId: inserted.id,
    courseId,
  });
  let ticket;
  try {
    const issued = await issueWorkshopTicketForBooking({
      bookingId: inserted.id,
      courseId,
      customerName,
      customerEmail: storedSimulationEmail,
    });
    ticket = issued.ticket;
    logWorkshopSimulationLookup("ticket create success", {
      bookingId: inserted.id,
      ticketId: ticket.id,
      courseId,
    });
  } catch (error) {
    logWorkshopSimulationLookup("ticket create failed", {
      bookingId: inserted.id,
      courseId,
      reason: error instanceof Error ? error.message : String(error),
    });
    throw new WorkshopSimulationError({
      code: "booking_insert_failed",
      step: "ticket_create",
      message: "Das Workshop-Ticket konnte nicht erzeugt werden.",
      courseFound: true,
      courseKind: course.kind,
      courseStatus: course.status,
      archivedAt: course.archived_at,
    });
  }

  const sessions = await loadWorkshopSessions(courseId);
  const sessionLines =
    sessions.length > 0 ? sessions.map((session) => formatSessionLine(session.starts_at, session.ends_at)) : [];

  const warnings: string[] = [];
  let paymentSimulated = false;
  let paymentTransactionId: string | null = null;
  let ledgerEntryId: string | null = null;
  let customerReceiptDocumentId: string | null = null;
  let customerReceiptPdfPath: string | null = null;
  let customerReceiptPdfGenerated = false;
  let customerReceiptPdfWarning: string | null = null;
  if (shouldSimulatePayment) {
    logWorkshopSimulationLookup("payment simulation start", {
      bookingId: inserted.id,
      amountCents,
      courseId,
    });
    try {
      const paymentResult = await simulateWorkshopPaymentSuccess({
        bookingId: inserted.id,
        adminUserId: input.adminUserId,
        amountCents,
        currency: course.currency,
        scenarioNote: "admin_test_bookings_workshop_booking",
      });
      paymentSimulated = true;
      paymentTransactionId = paymentResult.paymentTransactionId;
      ledgerEntryId = paymentTransactionId ? await loadPositiveLedgerEntryId(paymentTransactionId) : null;
      customerReceiptDocumentId = paymentResult.customerReceiptDocumentId ?? null;
      customerReceiptPdfPath = paymentResult.customerReceiptPdfPath ?? null;
      customerReceiptPdfGenerated = paymentResult.customerReceiptPdfGenerated ?? false;
      customerReceiptPdfWarning = paymentResult.customerReceiptPdfWarning ?? null;
      if (customerReceiptPdfWarning) {
        warnings.push(customerReceiptPdfWarning);
      }
      logWorkshopSimulationLookup("payment simulation success", {
        bookingId: inserted.id,
        courseId,
        paymentTransactionId,
        ledgerEntryId,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      logWorkshopSimulationLookup("payment simulation failed", {
        bookingId: inserted.id,
        courseId,
        reason,
      });
      warnings.push(`Interne Zahlungssimulation fehlgeschlagen: ${reason}`);
    }
  }

  const bookingConfirmed = isFreeBooking || paymentSimulated;
  const emailData = buildWorkshopEmailData({
    bookingId: inserted.id,
    course,
    customerName,
    customerEmail: storedSimulationEmail,
    sessionLines,
    paymentStatus: isFreeBooking ? "free" : "paid",
    qrToken: ticket.qr_token,
    mailContext,
  });

  let customerMailSent = false;
  let providerMailSent = false;
  if (actualCustomerMailRecipient && !bookingConfirmed) {
    warnings.push("Kund*innen-Testmail wurde uebersprungen, weil die Buchung nicht als bestaetigt gilt.");
  } else if (actualCustomerMailRecipient) {
    logWorkshopSimulationLookup("customer test mail start", {
      bookingId: inserted.id,
      courseId,
      recipient: actualCustomerMailRecipient,
    });
    try {
      await sendWorkshopSimulationCustomerMail({
        emailData,
        actualRecipientEmail: actualCustomerMailRecipient,
        paymentTransactionId,
      });

      const { error: updateError } = await admin
        .from("bookings")
        .update({ workshop_confirmation_email_sent_at: new Date().toISOString() })
        .eq("id", inserted.id)
        .eq("is_simulation", true);

      if (updateError) {
        logSupabaseStep("test mail timestamp update failed", updateError, {
          step: "test_mail",
          bookingId: inserted.id,
          courseId,
        });
        warnings.push(
          "Kund*innen-Testmail wurde gesendet, aber workshop_confirmation_email_sent_at konnte nicht gespeichert werden."
        );
      } else {
        customerMailSent = true;
        logWorkshopSimulationLookup("customer test mail success", {
          bookingId: inserted.id,
          courseId,
          recipient: actualCustomerMailRecipient,
        });
      }
    } catch (error) {
      logWorkshopSimulationLookup("customer test mail failed", {
        bookingId: inserted.id,
        courseId,
        recipient: actualCustomerMailRecipient,
        reason: error instanceof Error ? error.message : String(error),
      });
      warnings.push(
        error instanceof WorkshopSimulationError
          ? error.message
          : "Die angeforderte Kund*innen-Testmail konnte nicht verschickt werden."
      );
    }
  }

  if (actualProviderMailRecipient && !bookingConfirmed) {
    warnings.push("Anbieter*innen-Testmail wurde uebersprungen, weil die Buchung nicht als bestaetigt gilt.");
  } else if (actualProviderMailRecipient) {
    logWorkshopSimulationLookup("provider test mail start", {
      bookingId: inserted.id,
      courseId,
      recipient: actualProviderMailRecipient,
    });
    try {
      await sendWorkshopSimulationProviderMail({
        emailData,
        actualRecipientEmail: actualProviderMailRecipient,
      });

      const { error: updateError } = await admin
        .from("bookings")
        .update({ workshop_provider_notification_email_sent_at: new Date().toISOString() })
        .eq("id", inserted.id)
        .eq("is_simulation", true);

      if (updateError) {
        logSupabaseStep("provider test mail timestamp update failed", updateError, {
          step: "test_mail",
          bookingId: inserted.id,
          courseId,
        });
        warnings.push(
          "Anbieter*innen-Testmail wurde gesendet, aber workshop_provider_notification_email_sent_at konnte nicht gespeichert werden.",
        );
      } else {
        providerMailSent = true;
        logWorkshopSimulationLookup("provider test mail success", {
          bookingId: inserted.id,
          courseId,
          recipient: actualProviderMailRecipient,
        });
      }
    } catch (error) {
      logWorkshopSimulationLookup("provider test mail failed", {
        bookingId: inserted.id,
        courseId,
        recipient: actualProviderMailRecipient,
        reason: error instanceof Error ? error.message : String(error),
      });
      warnings.push(
        error instanceof WorkshopSimulationError
          ? error.message
          : "Die angeforderte Anbieter*innen-Testmail konnte nicht verschickt werden.",
      );
    }
  }

  return {
    bookingId: inserted.id,
    courseId,
    ticketId: ticket.id,
    ticketQrToken: ticket.qr_token,
    bookingCreated: true,
    ticketCreated: true,
    paymentSimulated,
    paymentTransactionId,
    ledgerEntryId,
    customerReceiptDocumentId,
    customerReceiptPdfPath,
    customerReceiptPdfGenerated,
    customerReceiptPdfWarning,
    customerMailSent,
    providerMailSent,
    mailError: warnings.length > 0 ? warnings.join(" ") : null,
    participantsHref: "/dashboard/participants",
    courseDetailHref: `/dashboard/courses/${courseId}`,
  };
}
