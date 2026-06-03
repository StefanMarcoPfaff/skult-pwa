export type TrialStatusSource = {
  kind: "trial";
  decisionStatus: string | null;
  cancelledAt: string | null;
};

export type RegisteredStatusSource = {
  kind: "registered";
  subscriptionStatus: string | null;
  subscriptionStopDate?: string | null;
};

export type WorkshopStatusSource = {
  kind: "workshop";
  bookingStatus: string | null;
  paymentStatus?: string | null;
  refundedAt?: string | null;
  stripeRefundId?: string | null;
};

export type ParticipantStatusSource = TrialStatusSource | RegisteredStatusSource | WorkshopStatusSource;

export type ParticipantStatusPresentation = {
  badgeLabel: string;
  badgeClassName: string;
  cardClassName: string;
  sortLabel: string;
};

function formatShortDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function getParticipantStatusPresentation(
  status: ParticipantStatusSource,
  checkedInAt: string | null
): ParticipantStatusPresentation {
  if (status.kind === "trial") {
    if (status.cancelledAt || status.decisionStatus === "rejected") {
      return {
        badgeLabel: "Abgesagt",
        badgeClassName: "border-red-200 bg-red-50 text-red-700",
        cardClassName: "border-red-200 bg-red-50/60",
        sortLabel: "Abgesagt",
      };
    }

    if ((status.decisionStatus ?? "pending") === "pending" && checkedInAt) {
      return {
        badgeLabel: "Entscheidung offen",
        badgeClassName: "border-amber-200 bg-amber-50 text-amber-800",
        cardClassName: "border-amber-200 bg-amber-50/60",
        sortLabel: "Entscheidung offen",
      };
    }

    if (status.decisionStatus === "approved") {
      return {
        badgeLabel: "Zugesagt",
        badgeClassName: "border-green-200 bg-green-50 text-green-700",
        cardClassName: "border-green-200 bg-green-50/60",
        sortLabel: "Zugesagt",
      };
    }

    return {
      badgeLabel: "Nicht eingecheckt",
      badgeClassName: "border-slate-200 bg-slate-50 text-slate-700",
      cardClassName: "border-green-200 bg-green-50/45",
      sortLabel: "Nicht eingecheckt",
    };
  }

  if (status.kind === "registered") {
    if (status.subscriptionStatus === "paused") {
      return {
        badgeLabel: "Pausiert",
        badgeClassName: "border-orange-200 bg-orange-50 text-orange-800",
        cardClassName: "border-orange-200 bg-orange-50/60",
        sortLabel: "Pausiert",
      };
    }

    if (status.subscriptionStatus === "pause_scheduled") {
      return {
        badgeLabel: "Pause geplant",
        badgeClassName: "border-orange-200 bg-orange-50 text-orange-800",
        cardClassName: "border-orange-200 bg-orange-50/60",
        sortLabel: "Pause geplant",
      };
    }

    if (status.subscriptionStatus === "cancel_scheduled") {
      const stopDateLabel = formatShortDate(status.subscriptionStopDate);
      return {
        badgeLabel: stopDateLabel ? `Kündigt zum ${stopDateLabel}` : "Kündigung geplant",
        badgeClassName: "border-amber-200 bg-amber-50 text-amber-800",
        cardClassName: "border-amber-200 bg-amber-50/60",
        sortLabel: stopDateLabel ? `Kündigt zum ${stopDateLabel}` : "Kündigung geplant",
      };
    }

    if (status.subscriptionStatus === "cancelled" || status.subscriptionStatus === "inactive") {
      return {
        badgeLabel: "Beendet",
        badgeClassName: "border-red-200 bg-red-50 text-red-700",
        cardClassName: "border-red-200 bg-red-50/60",
        sortLabel: "Beendet",
      };
    }

    if (checkedInAt) {
      return {
        badgeLabel: "Eingecheckt",
        badgeClassName: "border-emerald-200 bg-emerald-50 text-emerald-700",
        cardClassName: "border-emerald-200 bg-emerald-50/60",
        sortLabel: "Eingecheckt",
      };
    }

    return {
      badgeLabel: "Aktiv",
      badgeClassName: "border-green-200 bg-green-50 text-green-700",
      cardClassName: "border-green-200 bg-green-50/60",
      sortLabel: "Aktiv",
    };
  }

  if (status.refundedAt || status.stripeRefundId || status.bookingStatus === "refunded") {
    return {
      badgeLabel: "Erstattet",
      badgeClassName: "border-red-200 bg-red-50 text-red-700",
      cardClassName: "border-red-200 bg-red-50/60",
      sortLabel: "Erstattet",
    };
  }

  if (status.paymentStatus === "refund_pending") {
    return {
      badgeLabel: "Rückerstattung offen",
      badgeClassName: "border-amber-200 bg-amber-50 text-amber-800",
      cardClassName: "border-amber-200 bg-amber-50/60",
      sortLabel: "Rückerstattung offen",
    };
  }

  if (status.bookingStatus === "cancelled") {
    return {
      badgeLabel: "Storniert",
      badgeClassName: "border-red-200 bg-red-50 text-red-700",
      cardClassName: "border-red-200 bg-red-50/60",
      sortLabel: "Storniert",
    };
  }

  if (checkedInAt) {
    return {
      badgeLabel: "Eingecheckt",
      badgeClassName: "border-emerald-200 bg-emerald-50 text-emerald-700",
      cardClassName: "border-emerald-200 bg-emerald-50/60",
      sortLabel: "Eingecheckt",
    };
  }

  if (status.bookingStatus === "paid") {
    return {
      badgeLabel: "Bezahlt",
      badgeClassName: "border-green-200 bg-green-50 text-green-700",
      cardClassName: "border-green-200 bg-green-50/60",
      sortLabel: "Bezahlt",
    };
  }

  return {
    badgeLabel: "Beendet",
    badgeClassName: "border-red-200 bg-red-50 text-red-700",
    cardClassName: "border-red-200 bg-red-50/60",
    sortLabel: "Beendet",
  };
}
