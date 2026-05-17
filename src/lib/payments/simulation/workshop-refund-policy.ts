import "server-only";

export type SupportedWorkshopRefundPolicy =
  | "no_refund"
  | "free_until_14_days_then_100"
  | "free_until_7_days_then_100"
  | "fifty_until_14_days_then_100";

type LegacyWorkshopRefundPolicy =
  | "14_days_free"
  | "7_days_free"
  | "14_days_50";

type WorkshopRefundPolicyInput = SupportedWorkshopRefundPolicy | LegacyWorkshopRefundPolicy | string | null | undefined;

export type WorkshopRefundCalculation = {
  refund_amount_cents: number;
  retained_amount_cents: number;
  refund_percentage: number;
  retained_percentage: number;
  matched_policy: SupportedWorkshopRefundPolicy;
  explanation: string;
};

type NormalizedPolicyDescriptor = {
  policy: SupportedWorkshopRefundPolicy;
  cutoffDays: number | null;
  refundPercentBeforeCutoff: number;
  explanationBeforeCutoff: string;
  explanationAfterCutoff: string;
};

function normalizeGrossAmount(grossAmountCents: number): number {
  if (!Number.isFinite(grossAmountCents) || grossAmountCents < 0) {
    throw new Error("Invalid gross amount for workshop refund calculation.");
  }

  return Math.round(grossAmountCents);
}

function normalizePolicy(policy: WorkshopRefundPolicyInput): NormalizedPolicyDescriptor {
  switch (policy) {
    case "no_refund":
      return {
        policy: "no_refund",
        cutoffDays: null,
        refundPercentBeforeCutoff: 0,
        explanationBeforeCutoff: "Keine Erstattung laut Stornoregel.",
        explanationAfterCutoff: "Keine Erstattung laut Stornoregel.",
      };
    case "14_days_free":
    case "free_until_14_days_then_100":
      return {
        policy: "free_until_14_days_then_100",
        cutoffDays: 14,
        refundPercentBeforeCutoff: 100,
        explanationBeforeCutoff: "Bis 14 Tage vor Beginn wird voll erstattet.",
        explanationAfterCutoff: "Ab weniger als 14 Tagen vor Beginn wird nichts erstattet.",
      };
    case "7_days_free":
    case "free_until_7_days_then_100":
      return {
        policy: "free_until_7_days_then_100",
        cutoffDays: 7,
        refundPercentBeforeCutoff: 100,
        explanationBeforeCutoff: "Bis 7 Tage vor Beginn wird voll erstattet.",
        explanationAfterCutoff: "Ab weniger als 7 Tagen vor Beginn wird nichts erstattet.",
      };
    case "14_days_50":
    case "fifty_until_14_days_then_100":
      return {
        policy: "fifty_until_14_days_then_100",
        cutoffDays: 14,
        refundPercentBeforeCutoff: 50,
        explanationBeforeCutoff: "Bis 14 Tage vor Beginn werden 50 % erstattet.",
        explanationAfterCutoff: "Ab weniger als 14 Tagen vor Beginn wird nichts erstattet.",
      };
    default:
      throw new Error(`Unsupported workshop refund policy: ${policy ?? "null"}`);
  }
}

export function calculateWorkshopRefund(input: {
  workshop_storno_policy: WorkshopRefundPolicyInput;
  workshop_start_at: string;
  cancellation_timestamp: string;
  gross_amount_cents: number;
}): WorkshopRefundCalculation {
  const descriptor = normalizePolicy(input.workshop_storno_policy);
  const grossAmountCents = normalizeGrossAmount(input.gross_amount_cents);
  const workshopStartAt = new Date(input.workshop_start_at);
  const cancellationTimestamp = new Date(input.cancellation_timestamp);

  if (Number.isNaN(workshopStartAt.getTime())) {
    throw new Error("Invalid workshop start timestamp for refund calculation.");
  }

  if (Number.isNaN(cancellationTimestamp.getTime())) {
    throw new Error("Invalid cancellation timestamp for refund calculation.");
  }

  let refundPercentage = 0;
  let explanation = descriptor.explanationAfterCutoff;

  if (descriptor.cutoffDays === null) {
    refundPercentage = descriptor.refundPercentBeforeCutoff;
    explanation = descriptor.explanationBeforeCutoff;
  } else {
    const cutoffTimestamp = new Date(workshopStartAt.getTime() - descriptor.cutoffDays * 24 * 60 * 60 * 1000);
    const beforeOrAtCutoff = cancellationTimestamp.getTime() <= cutoffTimestamp.getTime();

    refundPercentage = beforeOrAtCutoff ? descriptor.refundPercentBeforeCutoff : 0;
    explanation = beforeOrAtCutoff ? descriptor.explanationBeforeCutoff : descriptor.explanationAfterCutoff;
  }

  const refundAmountCents = Math.round(grossAmountCents * (refundPercentage / 100));
  const retainedAmountCents = Math.max(0, grossAmountCents - refundAmountCents);

  return {
    refund_amount_cents: refundAmountCents,
    retained_amount_cents: retainedAmountCents,
    refund_percentage: refundPercentage,
    retained_percentage: Math.max(0, 100 - refundPercentage),
    matched_policy: descriptor.policy,
    explanation,
  };
}
