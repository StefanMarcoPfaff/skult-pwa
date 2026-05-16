import "server-only";

export const SIMULATION_DISABLED_MESSAGE = "Simulation disabled";
export const SIMULATION_UNAUTHORIZED_MESSAGE = "Unauthorized";
export const SIMULATION_MISSING_TARGET_ID_MESSAGE = "Missing target id";
export const SIMULATION_DUPLICATE_RISK_MESSAGE = "Already simulated / duplicate risk";

export type SimulationErrorCode =
  | "simulation_disabled"
  | "unauthorized"
  | "missing_target_id"
  | "duplicate_risk";

const SIMULATION_ERROR_MESSAGES: Record<SimulationErrorCode, string> = {
  simulation_disabled: SIMULATION_DISABLED_MESSAGE,
  unauthorized: SIMULATION_UNAUTHORIZED_MESSAGE,
  missing_target_id: SIMULATION_MISSING_TARGET_ID_MESSAGE,
  duplicate_risk: SIMULATION_DUPLICATE_RISK_MESSAGE,
};

export class PaymentSimulationError extends Error {
  readonly code: SimulationErrorCode;

  constructor(code: SimulationErrorCode) {
    super(SIMULATION_ERROR_MESSAGES[code]);
    this.name = "PaymentSimulationError";
    this.code = code;
  }
}

export function getSimulationErrorMessage(code: SimulationErrorCode): string {
  return SIMULATION_ERROR_MESSAGES[code];
}

export function createSimulationDisabledError(): PaymentSimulationError {
  return new PaymentSimulationError("simulation_disabled");
}

export function createSimulationUnauthorizedError(): PaymentSimulationError {
  return new PaymentSimulationError("unauthorized");
}

export function createSimulationMissingTargetIdError(): PaymentSimulationError {
  return new PaymentSimulationError("missing_target_id");
}

export function createSimulationDuplicateRiskError(): PaymentSimulationError {
  return new PaymentSimulationError("duplicate_risk");
}

export function assertSimulationTargetId(targetId: string | null | undefined): string {
  const normalizedTargetId = targetId?.trim() ?? "";
  if (!normalizedTargetId) {
    throw createSimulationMissingTargetIdError();
  }

  return normalizedTargetId;
}

export function assertSimulationNotDuplicate(isDuplicate: boolean): void {
  if (isDuplicate) {
    throw createSimulationDuplicateRiskError();
  }
}
