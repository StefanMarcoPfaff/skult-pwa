export { isSimulationModeEnabled } from "@/lib/payments/simulation/config";
export {
  assertSimulationNotDuplicate,
  assertSimulationTargetId,
  createSimulationDisabledError,
  createSimulationDuplicateRiskError,
  createSimulationMissingTargetIdError,
  createSimulationUnauthorizedError,
  getSimulationErrorMessage,
  PaymentSimulationError,
  SIMULATION_DISABLED_MESSAGE,
  SIMULATION_DUPLICATE_RISK_MESSAGE,
  SIMULATION_MISSING_TARGET_ID_MESSAGE,
  SIMULATION_UNAUTHORIZED_MESSAGE,
} from "@/lib/payments/simulation/errors";
export {
  createSimulatedEventId,
  createSimulatedPaymentId,
  createSimulatedPayoutId,
  createSimulatedRefundId,
} from "@/lib/payments/simulation/ids";
export { requirePaymentsV2SimulationAccess, canRunPaymentsV2Simulation } from "@/lib/payments/simulation/guard";
export { buildSimulationMetadata } from "@/lib/payments/simulation/metadata";
export type { SimulationMetadata } from "@/lib/payments/simulation/metadata";
export {
  createSimulationKey,
  createTestBookingSimulationMetadata,
  ensureSimulationEmail,
  normalizeSimulationEmail,
  TEST_BOOKINGS_SOURCE_ADMIN_UI,
} from "@/lib/payments/simulation/test-booking-metadata";
export type { TestBookingSimulationScenario } from "@/lib/payments/simulation/test-booking-metadata";
export { calculateWorkshopRefund } from "@/lib/payments/simulation/workshop-refund-policy";
export type {
  SupportedWorkshopRefundPolicy,
  WorkshopRefundCalculation,
} from "@/lib/payments/simulation/workshop-refund-policy";
