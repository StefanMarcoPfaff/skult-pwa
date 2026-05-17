"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePaymentsV2SimulationAccess } from "@/lib/payments/simulation";
import { TrialSimulationError, createTrialTestBooking } from "@/lib/payments/simulation/test-trial-booking";
import {
  WorkshopSimulationError,
  simulateWorkshopBooking,
} from "@/lib/payments/simulation/test-workshop-booking";
import { TEST_BOOKINGS_ADMIN_PATH } from "./ui";

function redirectWithActionState(actionState: string) {
  redirect(`${TEST_BOOKINGS_ADMIN_PATH}?action=${encodeURIComponent(actionState)}`);
}

function redirectWithParams(params: Record<string, string>) {
  const search = new URLSearchParams(params);
  redirect(`${TEST_BOOKINGS_ADMIN_PATH}?${search.toString()}`);
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
      paymentSimulated: result.paymentSimulated ? "yes" : "no",
      paymentTransactionId: result.paymentTransactionId,
      ledgerEntryId: result.ledgerEntryId,
      customerMailSent: result.customerMailSent ? "yes" : "no",
      providerMailSent: result.providerMailSent ? "yes" : "no",
      message: result.mailError ?? "",
    }));
  } catch (error) {
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

export async function prepareDirectCourseTestRegistrationAction() {
  await requirePaymentsV2SimulationAccess();
  redirectWithActionState("direct-course-foundation");
}
