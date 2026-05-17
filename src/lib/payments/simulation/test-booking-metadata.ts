import "server-only";

import { buildSimulationMetadata, type SimulationMetadata } from "@/lib/payments/simulation/metadata";

export const TEST_BOOKINGS_SOURCE_ADMIN_UI = "admin_test_bookings";

export type TestBookingSimulationScenario =
  | "workshop_test_booking"
  | "trial_test_booking"
  | "direct_course_test_registration";

function normalizeSimulationEmailLocalPart(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._+-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return normalized || "simulation";
}

export function normalizeSimulationEmail(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return "simulation@example.invalid";
  }

  const [rawLocalPart] = normalized.split("@");
  const localPart = normalizeSimulationEmailLocalPart(rawLocalPart ?? normalized);

  return `${localPart}@example.invalid`;
}

export function ensureSimulationEmail(value: string): string {
  const normalized = normalizeSimulationEmail(value);

  if (!normalized.endsWith(".invalid")) {
    throw new Error("Simulation emails must end with .invalid.");
  }

  return normalized;
}

export function createSimulationKey(input: {
  scenario: TestBookingSimulationScenario;
  courseId: string;
  email: string;
  qualifier?: string | null;
}): string {
  const courseId = input.courseId.trim().toLowerCase() || "unknown-course";
  const email = ensureSimulationEmail(input.email);
  const qualifier = input.qualifier?.trim().toLowerCase() || "default";

  return [TEST_BOOKINGS_SOURCE_ADMIN_UI, input.scenario, courseId, email, qualifier].join("::");
}

export function createTestBookingSimulationMetadata(input: {
  scenario: TestBookingSimulationScenario;
  triggeredByAdminUserId: string;
  triggeredAt?: string;
}): SimulationMetadata {
  return buildSimulationMetadata({
    triggeredByAdminUserId: input.triggeredByAdminUserId,
    triggeredAt: input.triggeredAt,
    scenario: input.scenario,
    sourceAdminUi: TEST_BOOKINGS_SOURCE_ADMIN_UI,
  });
}
