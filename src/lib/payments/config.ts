import "server-only";

export function parseBooleanEnvFlag(value: string | null | undefined): boolean {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export function isPaymentsV2SubscriptionsDualWriteEnabled(): boolean {
  return parseBooleanEnvFlag(process.env.PAYMENTS_V2_SUBSCRIPTIONS_DUAL_WRITE);
}

export function isPaymentsV2SimulationEnabled(): boolean {
  return parseBooleanEnvFlag(process.env.PAYMENTS_V2_SIMULATION_ENABLED);
}
