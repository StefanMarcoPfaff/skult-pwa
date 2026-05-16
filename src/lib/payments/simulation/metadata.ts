import "server-only";

export type SimulationMetadata = {
  simulation: true;
  triggered_by_admin_user_id: string;
  triggered_at: string;
  scenario: string;
  source_admin_ui: string;
};

export function buildSimulationMetadata(input: {
  triggeredByAdminUserId: string;
  scenario: string;
  sourceAdminUi: string;
  triggeredAt?: string;
}): SimulationMetadata {
  return {
    simulation: true,
    triggered_by_admin_user_id: input.triggeredByAdminUserId,
    triggered_at: input.triggeredAt ?? new Date().toISOString(),
    scenario: input.scenario,
    source_admin_ui: input.sourceAdminUi,
  };
}
