"use server";

import { redirect } from "next/navigation";
import { requirePaymentsV2SimulationAccess } from "@/lib/payments/simulation";
import { TEST_BOOKINGS_ADMIN_PATH } from "./ui";

function redirectWithActionState(actionState: string) {
  redirect(`${TEST_BOOKINGS_ADMIN_PATH}?action=${encodeURIComponent(actionState)}`);
}

export async function prepareWorkshopTestBookingAction() {
  await requirePaymentsV2SimulationAccess();
  redirectWithActionState("workshop-foundation");
}

export async function prepareTrialTestBookingAction() {
  await requirePaymentsV2SimulationAccess();
  redirectWithActionState("trial-foundation");
}

export async function prepareDirectCourseTestRegistrationAction() {
  await requirePaymentsV2SimulationAccess();
  redirectWithActionState("direct-course-foundation");
}
