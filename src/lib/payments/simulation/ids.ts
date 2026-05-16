import "server-only";

type SimulationIdPrefix = "sim_pay" | "sim_refund" | "sim_payout" | "sim_event";

function createSimulationId(prefix: SimulationIdPrefix): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

export function createSimulatedPaymentId(): string {
  return createSimulationId("sim_pay");
}

export function createSimulatedRefundId(): string {
  return createSimulationId("sim_refund");
}

export function createSimulatedPayoutId(): string {
  return createSimulationId("sim_payout");
}

export function createSimulatedEventId(): string {
  return createSimulationId("sim_event");
}
