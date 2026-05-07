type OfferArchiveStatus =
  | "draft"
  | "active"
  | "pause_scheduled"
  | "paused"
  | "stop_scheduled"
  | "ended"
  | string
  | null;

export type OfferArchiveInput = {
  kind: string | null;
  status: OfferArchiveStatus;
  startsAt: string | null;
  endsAt: string | null;
  archivedAt?: string | null;
  activeTrialCount: number;
  activeRegistrationCount: number;
  activeBookingCount: number;
  openPaymentCount: number;
};

export type ParticipantArchiveInput =
  | {
      source: "trial";
      archivedAt?: string | null;
      decisionStatus: string | null;
      cancelledAt: string | null;
      checkedInAt: string | null;
      hasCompletedRegistration: boolean;
    }
  | {
      source: "registered";
      archivedAt?: string | null;
      subscriptionStatus: string | null;
      stripeSubscriptionId: string | null;
      completedAt: string | null;
    }
  | {
      source: "workshop";
      archivedAt?: string | null;
      bookingStatus: string | null;
      checkedInAt: string | null;
      refundedAt: string | null;
      stripeRefundId: string | null;
    };

export type ArchiveEligibility = {
  allowed: boolean;
  reason: string;
};

function isFutureOrCurrent(value: string | null): boolean {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp >= Date.now();
}

export function getOfferArchiveEligibility(input: OfferArchiveInput): ArchiveEligibility {
  if (input.archivedAt) {
    return { allowed: false, reason: "Dieses Angebot ist bereits archiviert." };
  }

  const normalizedKind = String(input.kind ?? "").toLowerCase();
  const isRunningOffer =
    normalizedKind === "course"
      ? ["active", "pause_scheduled", "paused", "stop_scheduled"].includes(input.status ?? "")
      : isFutureOrCurrent(input.endsAt ?? input.startsAt) || ["active", "pause_scheduled", "paused"].includes(input.status ?? "");

  if (isRunningOffer) {
    return {
      allowed: false,
      reason:
        normalizedKind === "course"
          ? "Das laufende Angebot ist noch aktiv oder terminiert."
          : "Das einmalige Angebot ist noch aktiv oder noch nicht abgeschlossen.",
    };
  }

  if (input.activeTrialCount > 0 || input.activeRegistrationCount > 0) {
    return { allowed: false, reason: "Es gibt noch aktive oder offene Teilnahmen." };
  }

  if (input.activeBookingCount > 0) {
    return { allowed: false, reason: "Es gibt noch bestehende Buchungen für dieses Angebot." };
  }

  if (input.openPaymentCount > 0) {
    return { allowed: false, reason: "Es bestehen noch offene zahlungsrelevante Vorgänge." };
  }

  return { allowed: true, reason: "Angebot archivieren" };
}

export function getParticipantArchiveEligibility(input: ParticipantArchiveInput): ArchiveEligibility {
  if (input.archivedAt) {
    return { allowed: false, reason: "Diese Teilnahme ist bereits archiviert." };
  }

  if (input.source === "trial") {
    if (input.hasCompletedRegistration) {
      return { allowed: false, reason: "Es besteht bereits eine verbindliche Anmeldung." };
    }
    if (input.cancelledAt || input.decisionStatus === "rejected") {
      return { allowed: true, reason: "Teilnahme archivieren" };
    }
    if (input.decisionStatus === "approved") {
      return { allowed: false, reason: "Die Anmeldung ist noch freigegeben und damit offen." };
    }
    if (input.checkedInAt) {
      return { allowed: false, reason: "Nach dem Check-in ist noch eine Entscheidung offen." };
    }
    return { allowed: false, reason: "Die Probestunde ist noch aktiv oder noch nicht abgeschlossen." };
  }

  if (input.source === "registered") {
    if (["active", "pause_scheduled", "paused", "cancel_scheduled"].includes(input.subscriptionStatus ?? "")) {
      return { allowed: false, reason: "Die Teilnahme ist noch aktiv oder zahlungsrelevant offen." };
    }
    if (input.stripeSubscriptionId && !["cancelled", "inactive"].includes(input.subscriptionStatus ?? "")) {
      return { allowed: false, reason: "Die Teilnahme ist noch nicht vollständig beendet." };
    }
    if (!input.completedAt) {
      return { allowed: false, reason: "Die Anmeldung ist noch nicht abgeschlossen." };
    }
    return { allowed: true, reason: "Teilnahme archivieren" };
  }

  if (input.bookingStatus === "paid" && !input.refundedAt && !input.stripeRefundId) {
    return { allowed: false, reason: "Diese Buchung ist noch aktiv oder zahlungsrelevant offen." };
  }

  return { allowed: true, reason: "Teilnahme archivieren" };
}
