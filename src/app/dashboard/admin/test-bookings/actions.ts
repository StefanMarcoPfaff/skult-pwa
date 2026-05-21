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

  try {
    const simulateInitialPayment = parseCheckbox(formData.get("simulateInitialPayment"));
    const prepareParticipantTicket = parseCheckbox(formData.get("prepareParticipantTicket"));
    const result = await createDirectCourseTestRegistration({
      courseId: String(formData.get("courseId") ?? "").trim(),
      firstName: String(formData.get("firstName") ?? "").trim(),
      lastName: String(formData.get("lastName") ?? "").trim(),
      email: String(formData.get("email") ?? "").trim(),
      startDate: parseOptionalString(formData.get("startDate")),
      amountCents: parseOptionalAmountCents(formData.get("amountCents")),
      adminUserId: user.id,
    });

    revalidatePath(TEST_BOOKINGS_ADMIN_PATH);

    if (!simulateInitialPayment) {
      redirectWithParams({
        action: "direct-course-created",
        courseId: result.courseId,
        courseRegistrationIntentId: result.courseRegistrationIntentId,
        message: `Testkund*in: ${result.customerName}. Noch keine Zahlung, kein Ticket, kein Ledger - das folgt in PR 2.`,
      });
    }

    const alreadySimulated = await hasExistingSimulatedInitialPayment(result.courseRegistrationIntentId);
    const paymentResult = await simulateDirectCourseInitialPayment({
      courseRegistrationIntentId: result.courseRegistrationIntentId,
      adminUserId: user.id,
      amountCents: parseOptionalAmountCents(formData.get("amountCents")),
      currency: parseOptionalString(formData.get("currency")),
    });

    if (prepareParticipantTicket) {
      const ticketResult = await prepareDirectCourseParticipantTicket(result.courseRegistrationIntentId);
      revalidatePath("/dashboard/participants");
      revalidatePath(`/dashboard/courses/${result.courseId}/check-in`);
      redirectWithParams({
        action: "direct-course-ticket-prepared",
        courseId: result.courseId,
        courseRegistrationIntentId: ticketResult.courseRegistrationIntentId,
        subscriptionContractId: paymentResult.subscriptionContractId,
        subscriptionPeriodId: paymentResult.subscriptionPeriodId,
        subscriptionChargeId: paymentResult.subscriptionChargeId,
        paymentTransactionId: paymentResult.paymentTransactionId,
        ledgerEntryId: paymentResult.ledgerEntryId,
        ticketId: ticketResult.ticketId,
        ticketQrToken: ticketResult.ticketQrToken,
        message: ticketResult.ticketCreated
          ? `Testkund*in: ${result.customerName}. Initialzahlung intern simuliert und Kursticket vorbereitet. Keine echte Zahlung, keine Auszahlung, keine Mail.`
          : `Testkund*in: ${result.customerName}. Initialzahlung war bereits simuliert und das vorhandene Kursticket wurde wiederverwendet.`,
      });
    }

    revalidatePath("/dashboard/admin/payments-v2/subscriptions");
    redirectWithParams({
      action: "direct-course-payment-created",
      courseId: result.courseId,
      courseRegistrationIntentId: paymentResult.courseRegistrationIntentId,
      subscriptionContractId: paymentResult.subscriptionContractId,
      subscriptionPeriodId: paymentResult.subscriptionPeriodId,
      subscriptionChargeId: paymentResult.subscriptionChargeId,
      paymentTransactionId: paymentResult.paymentTransactionId,
      ledgerEntryId: paymentResult.ledgerEntryId,
      message: alreadySimulated
        ? `Testkund*in: ${result.customerName}. Bereits simulierte Initialzahlung wurde wiederverwendet. Keine echte Zahlung, keine Auszahlung, keine Mail.`
        : `Testkund*in: ${result.customerName}. Initialzahlung intern simuliert. Keine echte Zahlung, keine Auszahlung, keine Mail.`,
    });
  } catch (error) {
    revalidatePath(TEST_BOOKINGS_ADMIN_PATH);

    if (error instanceof DirectCourseSimulationError) {
      redirectWithParams(compactRedirectParams({
        action: "direct-course-error",
        code: error.code,
        step: error.step,
        duplicateBookingId: error.duplicateIntentId,
        supabaseCode: error.supabaseCode,
        supabaseMessage: error.supabaseMessage,
        message: error.message,
      }));
    }

    redirectWithParams({
      action: "direct-course-error",
      code: "unknown",
      message: "Die direkte Kurs-Testanmeldung konnte nicht erstellt werden.",
    });
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
        message: error.message,
      }));
    }

    redirectWithParams({
      action: "direct-course-payment-error",
      code: "unknown",
      message: "Die interne Erstzahlungs-Simulation konnte nicht ausgefuehrt werden.",
    });
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
    revalidatePath(TEST_BOOKINGS_ADMIN_PATH);

    if (error instanceof DirectCourseSimulationError) {
      redirectWithParams(compactRedirectParams({
        action: "direct-course-payment-error",
        code: error.code,
        step: error.step,
        duplicateBookingId: error.duplicateIntentId,
        supabaseCode: error.supabaseCode,
        supabaseMessage: error.supabaseMessage,
        message: error.message,
      }));
    }

    redirectWithParams({
      action: "direct-course-payment-error",
      code: "unknown",
      message: "Das Kursticket fuer die Simulations-Teilnahme konnte nicht vorbereitet werden.",
    });
  }
}
