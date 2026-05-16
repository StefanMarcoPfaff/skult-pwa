import "server-only";

import { isPaymentsV2SimulationEnabled } from "@/lib/payments/config";

export function isSimulationModeEnabled(): boolean {
  return isPaymentsV2SimulationEnabled();
}
