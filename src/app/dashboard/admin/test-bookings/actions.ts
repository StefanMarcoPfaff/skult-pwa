"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { requirePaymentsV2SimulationAccess } from "@/lib/payments/simulation";
import {
  createDirectCourseTestRegistration,
  DirectCourseSimulationError,
  loadSimulatableDirectCourseIntent,
  prepareDirectCourseParticipantTicket,
} from "@/lib/payments/simulation/test-direct-course-registration";
import { simulateSubscriptionInitialPaymentSuccess } from "@/lib/payments/simulation/subscription-initial-payment-simulation";
import { TrialSimulationError, createTrialTestBooking } from "@/lib/payments/simulation/test-trial-booking";
import {
  WorkshopSimulationError,
  simulateWorkshopBooking,
} from "@/lib/payments/simulation/test-workshop-booking";
import { TEST_BOOKINGS_ADMIN_PATH } from "./ui";

const DIRECT_COURSE_ACTION_VERSION = "DIRECT_COURSE_ACTION_VERSION_20260521_DEBUG";

function redirectWithParams(params: Record<string, string>) {
  const search = new URLSearchParams(params);
  redirect(`${TEST_BOOKINGS_ADMIN_PATH}?${search.toString()}`);
}

function isNextRedirectError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

function logUnexpectedDirectCourseError(context: string, error: unknown) {
  console.error(`[admin-test-bookings] ${context}`, error);
}

function logDirectCourseActionSubmission(input: {
  selectedAction: string;
  courseId: string;
  formData: FormData;
}) {
  console.info(DIRECT_COURSE_ACTION_VERSION, {
    selectedAction: input.selectedAction,
    actionName: input.selectedAction,
    courseIdPresent: Boolean(input.courseId),
    receivedCourseId: input.courseId || null,
    formValueKeys: Array.from(input.formData.keys()),
  });
}

function stringifyUnknownError(error: unknown): string | null {
  try {
    return JSON.stringify(error);
  } catch {
    return null;
  }
}

function buildDirectCourseErrorParams(input: {
  action: "direct-course-error" | "direct-course-payment-error";
  error: unknown;
  rawErrorStep?: string | null;
  intentCreated?: boolean;
  initialPaymentCreated?: boolean;
  ticketPrepared?: boolean;
  courseId?: string | null;
  courseRegistrationIntentId?: string | null;
}) {
  const errorName =
    input.error instanceof Error
      ? input.error.name
      : typeof input.error === "object" && input.error !== null && "name" in input.error
        ? String((input.error as { name?: unknown }).name ?? "")
        : "UnknownError";
  const errorMessage =
    input.error instanceof Error
      ? input.error.message
      : typeof input.error === "object" && input.error !== null && "message" in input.error
        ? String((input.error as { message?: unknown }).message ?? "")
        : typeof input.error === "string"
          ? input.error
          : "Die direkte Kurs-Testanmeldung konnte nicht erstellt werden.";
  const stackFirstLine =
    input.error instanceof Error ? input.error.stack?.split("\n")[0]?.trim() ?? null : null;

  if (input.error instanceof DirectCourseSimulationError) {
    return compactRedirectParams({
      action: input.action,
      code: input.error.code,
      step: input.error.step,
      duplicateBookingId: input.error.duplicateIntentId,
      supabaseCode: input.error.supabaseCode,
      supabaseMessage: input.error.supabaseMessage,
      supabaseDetails: input.error.supabaseDetails,
      supabaseHint: input.error.supabaseHint,
      message: input.error.message,
      rawErrorName: input.error.name,
      rawErrorMessage: input.error.message,
      rawErrorStep: input.rawErrorStep ?? input.error.step,
      rawErrorStackFirstLine: stackFirstLine,
      rawErrorJson: stringifyUnknownError(input.error),
      actionVersion: DIRECT_COURSE_ACTION_VERSION,
      intentCreated: input.intentCreated ? "yes" : "no",
      initialPaymentCreated: input.initialPaymentCreated ? "yes" : "no",
      ticketPrepared: input.ticketPrepared ? "yes" : "no",
      courseId: input.courseId,
      courseRegistrationIntentId: input.courseRegistrationIntentId,
    });
  }

  return compactRedirectParams({
    action: input.action,
    code: "unknown",
    message: errorMessage,
    rawErrorName: errorName,
    rawErrorMessage: errorMessage,
    rawErrorStep: input.rawErrorStep,
    rawErrorStackFirstLine: stackFirstLine,
    rawErrorJson: stringifyUnknownError(input.error),
    actionVersion: DIRECT_COURSE_ACTION_VERSION,
    intentCreated: input.intentCreated ? "yes" : "no",
    initialPaymentCreated: input.initialPaymentCreated ? "yes" : "no",
    ticketPrepared: input.ticketPrepared ? "yes" : "no",
    courseId: input.courseId,
    courseRegistrationIntentId: input.courseRegistrationIntentId,
  });
}

function compactRedirectParams(input: Record<string, string | null | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(input).filter((entry): entry is [string, string] => Boolean(entry[1]))
  );
}

function parseOptionalString(value: FormDataEntryValue | null): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function parseCheckbox(value: FormDataEntryValue | null): boolean {
  return String(value ?? "").trim().toLowerCase() === "on";
}

function parseOptionalAmountCents(value: FormDataEntryValue | null): number | null {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.round(parsed));
}

async function hasExistingSimulatedInitialPayment(courseRegistrationIntentId: string): Promise<boolean> {
  const admin = createSupabaseAdmin();
  const { data } = await admin
    .from("payment_transactions")
    .select("id")
    .eq("provider", "internal_simulation")
    .eq("course_registration_intent_id", courseRegistrationIntentId)
    .eq("status", "paid")
    .limit(1)
    .maybeSingle<{ id: string }>();

  return Boolean(data?.id);
}

export async function prepareWorkshopTestBookingAction(formData: FormData) {
  const user = await requirePaymentsV2SimulationAccess();

  try {
    const result = await simulateWorkshopBooking({
      courseId: String(formData.get("courseId") ?? "").trim(),
      firstName: String(formData.get("firstName") ?? "").trim(),
      lastName: String(formData.get("lastName") ?? "").trim(),
      email: String(formData.get("email") ?? "").trim(),
      amountCents: parseOptionalAmountCents(formData.get("amountCents")),
      simulatePayment: parseCheckbox(formData.get("simulatePayment")),
      sendCustomerTestMail: parseCheckbox(formData.get("sendCustomerTestMail")),
      sendProviderTestMail: parseCheckbox(formData.get("sendProviderTestMail")),
      customerTestMailRecipient: parseOptionalString(formData.get("customerTestMailRecipient")),
      providerTestMailRecipient: parseOptionalString(formData.get("providerTestMailRecipient")),
      adminUserId: user.id,
    });

    revalidatePath(TEST_BOOKINGS_ADMIN_PATH);
    revalidatePath("/dashboard/participants");
    revalidatePath("/dashboard/earnings");
    revalidatePath("/dashboard/admin/payments-v2");
    revalidatePath(`/dashboard/courses/${result.courseId}`);
    redirectWithParams(compactRedirectParams({
      action: "workshop-created",
      bookingId: result.bookingId,
      courseId: result.courseId,
      ticketId: result.ticketId,
      bookingCreated: result.bookingCreated ? "yes" : "no",
      ticketCreated: result.ticketCreated ? "yes" : "no",
      paymentSimulated: result.paymentSimulated ? "yes" : "no",
      paymentTransactionId: result.paymentTransactionId,
      ledgerEntryId: result.ledgerEntryId,
      customerMailSent: result.customerMailSent ? "yes" : "no",
      providerMailSent: result.providerMailSent ? "yes" : "no",
      message: result.mailError ?? "",
    }));
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    revalidatePath(TEST_BOOKINGS_ADMIN_PATH);

    if (error instanceof WorkshopSimulationError) {
      redirectWithParams(compactRedirectParams({
        action: "workshop-error",
        code: error.code,
        step: error.step,
        courseFound: error.courseFound === null ? null : error.courseFound ? "yes" : "no",
        kind: error.courseKind,
        status: error.courseStatus,
        archivedAt: error.archivedAt,
        supabaseMessage: error.supabaseMessage,
        supabaseCode: error.supabaseCode,
        duplicateBookingId: error.duplicateBookingId,
        message: error.message,
      }));
    }

    redirectWithParams({
      action: "workshop-error",
      code: "unknown",
      message: "Die Workshop-Testbuchung konnte nicht erstellt werden.",
    });
  }
}

export async function prepareTrialTestBookingAction(formData: FormData) {
  const user = await requirePaymentsV2SimulationAccess();

  try {
    const result = await createTrialTestBooking({
      courseId: String(formData.get("courseId") ?? "").trim(),
      firstName: String(formData.get("firstName") ?? "").trim(),
      lastName: String(formData.get("lastName") ?? "").trim(),
      email: String(formData.get("email") ?? "").trim(),
      trialSlotId: parseOptionalString(formData.get("trialSlotId")),
      sendTestMail: parseCheckbox(formData.get("sendTestMail")),
      testMailRecipientOverride: parseOptionalString(formData.get("testMailRecipientOverride")),
      adminUserId: user.id,
    });

    revalidatePath("/dashboard/participants");
    revalidatePath(TEST_BOOKINGS_ADMIN_PATH);
    redirectWithParams({
      action: "trial-created",
      reservationId: result.reservationId,
      ticketId: result.ticketId,
      mailSent: result.mailSent ? "yes" : "no",
      message: result.mailError ?? "",
    });
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    revalidatePath(TEST_BOOKINGS_ADMIN_PATH);

    if (error instanceof TrialSimulationError) {
      redirectWithParams({
        action: "trial-error",
        code: error.code,
        message: error.message,
      });
    }

    redirectWithParams({
      action: "trial-error",
      code: "unknown",
      message: "Die Trial-Testbuchung konnte nicht erstellt werden.",
    });
  }
}

export async function prepareDirectCourseTestRegistrationAction(formData: FormData) {
  const user = await requirePaymentsV2SimulationAccess();
  let rawErrorStep = "action_start";
  let createdIntentId: string | null = null;
  let courseId: string | null = null;
  let intentCreated = false;
  let initialPaymentCreated = false;
  let ticketPrepared = false;

  try {
    courseId = String(formData.get("courseId") ?? "").trim();
    const firstName = String(formData.get("firstName") ?? "").trim();
    const lastName = String(formData.get("lastName") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    const simulateInitialPayment = parseCheckbox(formData.get("simulateInitialPayment"));
    const prepareParticipantTicket = parseCheckbox(formData.get("prepareParticipantTicket"));
    logDirectCourseActionSubmission({
      selectedAction: "prepareDirectCourseTestRegistrationAction",
      courseId,
      formData,
    });

    if (!courseId) {
      console.info(DIRECT_COURSE_ACTION_VERSION, {
        step: "course_lookup",
        reason: "missing_course_id",
      });
      redirectWithParams({
        action: "direct-course-error",
        code: "missing_course_id",
        step: "course_lookup",
        rawErrorStep: "course_lookup",
        rawErrorName: "DirectCourseValidationError",
        rawErrorMessage: "Bitte ein laufendes Angebot auswaehlen.",
        actionVersion: DIRECT_COURSE_ACTION_VERSION,
        message: "Bitte ein laufendes Angebot auswaehlen.",
      });
    }

    rawErrorStep = "intent_insert";
    console.info(DIRECT_COURSE_ACTION_VERSION, {
      step: rawErrorStep,
      actionName: "prepareDirectCourseTestRegistrationAction",
      courseId,
    });
    const result = await createDirectCourseTestRegistration({
      courseId,
      firstName,
      lastName,
      email,
      startDate: parseOptionalString(formData.get("startDate")),
      amountCents: parseOptionalAmountCents(formData.get("amountCents")),
      adminUserId: user.id,
    });
    createdIntentId = result.courseRegistrationIntentId;
    intentCreated = true;
    console.info(DIRECT_COURSE_ACTION_VERSION, {
      step: "intent_insert_success",
      courseId: result.courseId,
      courseRegistrationIntentId: result.courseRegistrationIntentId,
    });

    rawErrorStep = "revalidate_after_intent";
    revalidatePath(TEST_BOOKINGS_ADMIN_PATH);
    console.info(DIRECT_COURSE_ACTION_VERSION, {
      step: rawErrorStep,
      ok: true,
    });

    if (!simulateInitialPayment) {
      rawErrorStep = "redirect_intent_created";
      console.info(DIRECT_COURSE_ACTION_VERSION, {
        step: rawErrorStep,
        courseId: result.courseId,
        courseRegistrationIntentId: result.courseRegistrationIntentId,
      });
      redirectWithParams({
        action: "direct-course-created",
        actionVersion: DIRECT_COURSE_ACTION_VERSION,
        courseId: result.courseId,
        courseRegistrationIntentId: result.courseRegistrationIntentId,
        intentCreated: "yes",
        initialPaymentCreated: "no",
        ticketPrepared: "no",
        message: `Testkund*in: ${result.customerName}. Noch keine Zahlung, kein Ticket, kein Ledger - das folgt in PR 2.`,
      });
    }

    rawErrorStep = "initial_payment_lookup";
    const alreadySimulated = await hasExistingSimulatedInitialPayment(result.courseRegistrationIntentId);
    console.info(DIRECT_COURSE_ACTION_VERSION, {
      step: rawErrorStep,
      alreadySimulated,
      courseRegistrationIntentId: result.courseRegistrationIntentId,
    });
    rawErrorStep = "initial_payment";
    const paymentResult = await simulateDirectCourseInitialPayment({
      courseRegistrationIntentId: result.courseRegistrationIntentId,
      adminUserId: user.id,
      amountCents: parseOptionalAmountCents(formData.get("amountCents")),
      currency: parseOptionalString(formData.get("currency")),
    });
    initialPaymentCreated = true;
    console.info(DIRECT_COURSE_ACTION_VERSION, {
      step: "initial_payment_success",
      courseRegistrationIntentId: paymentResult.courseRegistrationIntentId,
      subscriptionContractId: paymentResult.subscriptionContractId,
    });

    if (prepareParticipantTicket) {
      rawErrorStep = "ticket_prepare";
      const ticketResult = await prepareDirectCourseParticipantTicket(result.courseRegistrationIntentId);
      ticketPrepared = true;
      console.info(DIRECT_COURSE_ACTION_VERSION, {
        step: "ticket_prepare_success",
        courseRegistrationIntentId: ticketResult.courseRegistrationIntentId,
        ticketId: ticketResult.ticketId,
      });
      rawErrorStep = "revalidate_after_ticket";
      revalidatePath("/dashboard/participants");
      revalidatePath(`/dashboard/courses/${result.courseId}/check-in`);
      console.info(DIRECT_COURSE_ACTION_VERSION, {
        step: rawErrorStep,
        ok: true,
      });
      rawErrorStep = "redirect_ticket_prepared";
      redirectWithParams({
        action: "direct-course-ticket-prepared",
        actionVersion: DIRECT_COURSE_ACTION_VERSION,
        courseId: result.courseId,
        courseRegistrationIntentId: ticketResult.courseRegistrationIntentId,
        subscriptionContractId: paymentResult.subscriptionContractId,
        subscriptionPeriodId: paymentResult.subscriptionPeriodId,
        subscriptionChargeId: paymentResult.subscriptionChargeId,
        paymentTransactionId: paymentResult.paymentTransactionId,
        ledgerEntryId: paymentResult.ledgerEntryId,
        ticketId: ticketResult.ticketId,
        ticketQrToken: ticketResult.ticketQrToken,
        intentCreated: "yes",
        initialPaymentCreated: "yes",
        ticketPrepared: "yes",
        message: ticketResult.ticketCreated
          ? `Testkund*in: ${result.customerName}. Initialzahlung intern simuliert und Kursticket vorbereitet. Keine echte Zahlung, keine Auszahlung, keine Mail.`
          : `Testkund*in: ${result.customerName}. Initialzahlung war bereits simuliert und das vorhandene Kursticket wurde wiederverwendet.`,
      });
    }

    rawErrorStep = "revalidate_after_payment";
    revalidatePath("/dashboard/admin/payments-v2/subscriptions");
    console.info(DIRECT_COURSE_ACTION_VERSION, {
      step: rawErrorStep,
      ok: true,
    });
    rawErrorStep = "redirect_payment_created";
    redirectWithParams({
      action: "direct-course-payment-created",
      actionVersion: DIRECT_COURSE_ACTION_VERSION,
      courseId: result.courseId,
      courseRegistrationIntentId: paymentResult.courseRegistrationIntentId,
      subscriptionContractId: paymentResult.subscriptionContractId,
      subscriptionPeriodId: paymentResult.subscriptionPeriodId,
      subscriptionChargeId: paymentResult.subscriptionChargeId,
      paymentTransactionId: paymentResult.paymentTransactionId,
      ledgerEntryId: paymentResult.ledgerEntryId,
      intentCreated: "yes",
      initialPaymentCreated: "yes",
      ticketPrepared: "no",
      message: alreadySimulated
        ? `Testkund*in: ${result.customerName}. Bereits simulierte Initialzahlung wurde wiederverwendet. Keine echte Zahlung, keine Auszahlung, keine Mail.`
        : `Testkund*in: ${result.customerName}. Initialzahlung intern simuliert. Keine echte Zahlung, keine Auszahlung, keine Mail.`,
    });
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    revalidatePath(TEST_BOOKINGS_ADMIN_PATH);
    logUnexpectedDirectCourseError("prepareDirectCourseTestRegistrationAction", error);
    const action = intentCreated ? "direct-course-payment-error" : "direct-course-error";
    redirectWithParams(
      buildDirectCourseErrorParams({
        action,
        error,
        rawErrorStep,
        intentCreated,
        initialPaymentCreated,
        ticketPrepared,
        courseId,
        courseRegistrationIntentId: createdIntentId,
      })
    );
  }
}

async function simulateDirectCourseInitialPayment(input: {
  courseRegistrationIntentId: string;
  adminUserId: string;
  amountCents?: number | null;
  currency?: string | null;
}) {
  await loadSimulatableDirectCourseIntent(input.courseRegistrationIntentId);

  return simulateSubscriptionInitialPaymentSuccess({
    courseRegistrationIntentId: input.courseRegistrationIntentId,
    adminUserId: input.adminUserId,
    amountCents: input.amountCents,
    currency: input.currency,
    scenarioNote: "admin_test_bookings_direct_course",
  });
}

export async function simulateDirectCourseInitialPaymentAction(formData: FormData) {
  const user = await requirePaymentsV2SimulationAccess();
  const courseRegistrationIntentId = String(formData.get("courseRegistrationIntentId") ?? "").trim();

  try {
    const validatedIntent = await loadSimulatableDirectCourseIntent(courseRegistrationIntentId);
    const alreadySimulated = await hasExistingSimulatedInitialPayment(courseRegistrationIntentId);
    const prepareParticipantTicket = parseCheckbox(formData.get("prepareParticipantTicket"));
    const result = await simulateDirectCourseInitialPayment({
      courseRegistrationIntentId,
      adminUserId: user.id,
      amountCents: parseOptionalAmountCents(formData.get("amountCents")),
      currency: parseOptionalString(formData.get("currency")),
    });

    if (prepareParticipantTicket) {
      const ticketResult = await prepareDirectCourseParticipantTicket(courseRegistrationIntentId);
      revalidatePath(TEST_BOOKINGS_ADMIN_PATH);
      revalidatePath("/dashboard/admin/payments-v2/subscriptions");
      revalidatePath("/dashboard/participants");
      revalidatePath(`/dashboard/courses/${validatedIntent.course_id}/check-in`);
      redirectWithParams({
        action: "direct-course-ticket-prepared",
        courseId: validatedIntent.course_id,
        courseRegistrationIntentId: result.courseRegistrationIntentId,
        subscriptionContractId: result.subscriptionContractId,
        subscriptionPeriodId: result.subscriptionPeriodId,
        subscriptionChargeId: result.subscriptionChargeId,
        paymentTransactionId: result.paymentTransactionId,
        ledgerEntryId: result.ledgerEntryId,
        ticketId: ticketResult.ticketId,
        ticketQrToken: ticketResult.ticketQrToken,
        message: alreadySimulated
          ? "Bereits simulierte Initialzahlung und vorhandenes Kursticket wurden wiederverwendet. Keine echte Zahlung, keine Auszahlung, keine Mail."
          : "Initialzahlung intern simuliert und Kursticket vorbereitet. Keine echte Zahlung, keine Auszahlung, keine Mail.",
      });
    }

    revalidatePath(TEST_BOOKINGS_ADMIN_PATH);
    revalidatePath("/dashboard/admin/payments-v2/subscriptions");
    redirectWithParams({
      action: "direct-course-payment-created",
      courseId: validatedIntent.course_id,
      courseRegistrationIntentId: result.courseRegistrationIntentId,
      subscriptionContractId: result.subscriptionContractId,
      subscriptionPeriodId: result.subscriptionPeriodId,
      subscriptionChargeId: result.subscriptionChargeId,
      paymentTransactionId: result.paymentTransactionId,
      ledgerEntryId: result.ledgerEntryId,
      message: alreadySimulated
        ? "Bereits simulierte Initialzahlung wurde wiederverwendet. Keine echte Zahlung, keine Auszahlung, keine Mail."
        : "Initialzahlung intern simuliert. Keine echte Zahlung, keine Auszahlung, keine Mail.",
    });
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    revalidatePath(TEST_BOOKINGS_ADMIN_PATH);
    revalidatePath("/dashboard/admin/payments-v2/subscriptions");

    if (error instanceof DirectCourseSimulationError) {
      redirectWithParams(compactRedirectParams({
        action: "direct-course-payment-error",
        code: error.code,
        step: error.step,
        duplicateBookingId: error.duplicateIntentId,
        supabaseCode: error.supabaseCode,
        supabaseMessage: error.supabaseMessage,
        supabaseDetails: error.supabaseDetails,
        supabaseHint: error.supabaseHint,
        message: error.message,
      }));
    }

    logUnexpectedDirectCourseError("simulateDirectCourseInitialPaymentAction", error);

    redirectWithParams(compactRedirectParams({
      action: "direct-course-payment-error",
      code: "unknown",
      message: error instanceof Error ? error.message : "Die interne Erstzahlungs-Simulation konnte nicht ausgefuehrt werden.",
    }));
  }
}

export async function prepareDirectCourseParticipantTicketAction(formData: FormData) {
  await requirePaymentsV2SimulationAccess();
  const courseRegistrationIntentId = String(formData.get("courseRegistrationIntentId") ?? "").trim();

  try {
    const result = await prepareDirectCourseParticipantTicket(courseRegistrationIntentId);

    revalidatePath(TEST_BOOKINGS_ADMIN_PATH);
    revalidatePath("/dashboard/participants");
    revalidatePath(`/dashboard/courses/${result.courseId}/check-in`);
    redirectWithParams({
      action: "direct-course-ticket-prepared",
      courseId: result.courseId,
      courseRegistrationIntentId: result.courseRegistrationIntentId,
      subscriptionContractId: result.subscriptionContractId,
      ticketId: result.ticketId,
      ticketQrToken: result.ticketQrToken,
      message: result.ticketCreated
        ? `Kursticket fuer ${result.customerName} vorbereitet. Teilnehmeransicht und Check-in koennen jetzt contract-aware darauf zugreifen.`
        : `Vorhandenes Kursticket fuer ${result.customerName} wiederverwendet. Teilnehmeransicht und Check-in koennen jetzt contract-aware darauf zugreifen.`,
    });
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    revalidatePath(TEST_BOOKINGS_ADMIN_PATH);

    if (error instanceof DirectCourseSimulationError) {
      redirectWithParams(compactRedirectParams({
        action: "direct-course-payment-error",
        code: error.code,
        step: error.step,
        duplicateBookingId: error.duplicateIntentId,
        supabaseCode: error.supabaseCode,
        supabaseMessage: error.supabaseMessage,
        supabaseDetails: error.supabaseDetails,
        supabaseHint: error.supabaseHint,
        message: error.message,
      }));
    }

    logUnexpectedDirectCourseError("prepareDirectCourseParticipantTicketAction", error);

    redirectWithParams(compactRedirectParams({
      action: "direct-course-payment-error",
      code: "unknown",
      message: error instanceof Error ? error.message : "Das Kursticket fuer die Simulations-Teilnahme konnte nicht vorbereitet werden.",
    }));
  }
}
