"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePaymentsV2SimulationAccess } from "@/lib/payments/simulation";
import { TrialSimulationError, createTrialTestBooking } from "@/lib/payments/simulation/test-trial-booking";
import { TEST_BOOKINGS_ADMIN_PATH } from "./ui";

function redirectWithActionState(actionState: string) {
  redirect(`${TEST_BOOKINGS_ADMIN_PATH}?action=${encodeURIComponent(actionState)}`);
}

function redirectWithParams(params: Record<string, string>) {
  const search = new URLSearchParams(params);
  redirect(`${TEST_BOOKINGS_ADMIN_PATH}?${search.toString()}`);
}

function parseOptionalString(value: FormDataEntryValue | null): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function parseCheckbox(value: FormDataEntryValue | null): boolean {
  return String(value ?? "").trim().toLowerCase() === "on";
}

export async function prepareWorkshopTestBookingAction() {
  await requirePaymentsV2SimulationAccess();
  redirectWithActionState("workshop-foundation");
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
