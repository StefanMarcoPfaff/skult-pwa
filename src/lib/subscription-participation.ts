type ContractParticipationStateInput = {
  contractStatus: string | null;
  subscriptionStatus?: string | null;
  pauseStartDate?: string | null;
  pauseEndDate?: string | null;
  cancelEffectiveDate?: string | null;
  subscriptionStopDate?: string | null;
  eventDate?: string | null;
};

export type ContractParticipationGate = {
  allowed: boolean;
  reason: string | null;
};

function normalizeDate(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  if (!normalized) return null;
  return normalized.slice(0, 10);
}

function isWithinInclusive(value: string, start: string | null, end: string | null): boolean {
  if (!start || !end) return false;
  return value >= start && value <= end;
}

export function getContractParticipationGate(input: ContractParticipationStateInput): ContractParticipationGate {
  const eventDate = normalizeDate(input.eventDate);
  const pauseStartDate = normalizeDate(input.pauseStartDate);
  const pauseEndDate = normalizeDate(input.pauseEndDate);
  const effectiveEndDate = normalizeDate(input.subscriptionStopDate) ?? normalizeDate(input.cancelEffectiveDate);
  const contractStatus = input.contractStatus ?? null;
  const subscriptionStatus = input.subscriptionStatus ?? null;

  if (eventDate && isWithinInclusive(eventDate, pauseStartDate, pauseEndDate)) {
    return {
      allowed: false,
      reason: "Teilnahme ist fuer diesen Zeitraum pausiert",
    };
  }

  if (subscriptionStatus === "paused" || contractStatus === "paused") {
    return {
      allowed: false,
      reason: "Teilnahme ist pausiert",
    };
  }

  if (
    subscriptionStatus === "cancelled" ||
    subscriptionStatus === "inactive" ||
    contractStatus === "cancelled" ||
    contractStatus === "ended"
  ) {
    return {
      allowed: false,
      reason: "Vertrag ist beendet",
    };
  }

  if (eventDate && effectiveEndDate && eventDate > effectiveEndDate) {
    return {
      allowed: false,
      reason: "Vertrag ist fuer diesen Termin bereits beendet",
    };
  }

  return {
    allowed: true,
    reason: null,
  };
}
