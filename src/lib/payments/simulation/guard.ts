import "server-only";

import { parsePaymentsV2AdminEmails, requirePaymentsV2AdminAccess } from "@/app/dashboard/admin/payments-v2/access";
import { isSimulationModeEnabled } from "@/lib/payments/simulation/config";
import {
  createSimulationDisabledError,
  createSimulationUnauthorizedError,
} from "@/lib/payments/simulation/errors";

export function canRunPaymentsV2Simulation(userEmail: string | null | undefined): boolean {
  if (!isSimulationModeEnabled()) {
    return false;
  }

  const normalizedEmail = userEmail?.trim().toLowerCase() ?? "";
  const configuredEmails = parsePaymentsV2AdminEmails();

  if (!normalizedEmail || configuredEmails.length === 0) {
    return false;
  }

  return configuredEmails.includes(normalizedEmail);
}

export async function requirePaymentsV2SimulationAccess() {
  const user = await requirePaymentsV2AdminAccess();

  if (!isSimulationModeEnabled()) {
    throw createSimulationDisabledError();
  }

  if (!canRunPaymentsV2Simulation(user.email)) {
    throw createSimulationUnauthorizedError();
  }

  return user;
}
