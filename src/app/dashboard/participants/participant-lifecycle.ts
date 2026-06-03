import { DISABLED_OFFER_ACTION_ICON_CLASS } from "@/app/dashboard/courses/display-status";

const ACTIVE_FILLED_CLASS = "border-green-600 bg-green-600 text-white";
const ACTIVE_OUTLINE_CLASS = "border-green-600 bg-background text-green-700";
const PAUSE_FILLED_CLASS = "border-orange-500 bg-orange-500 text-white";
const PAUSE_OUTLINE_CLASS = "border-orange-500 bg-background text-orange-700";
const STOP_FILLED_CLASS = "border-red-600 bg-red-600 text-white";
const STOP_OUTLINE_CLASS = "border-red-600 bg-background text-red-700";
const AVAILABLE_ACTION_CLASS = "border-slate-900 bg-background text-slate-950 hover:bg-slate-50";

export type ParticipantLifecycleInput = {
  reservationCancelledAt?: string | null;
  reservationDecisionStatus?: string | null;
  trialTicketStatus?: string | null;
  hasCompletedRegistration?: boolean;
  subscriptionStatus?: string | null;
};

export type ParticipantLifecycleDisplay = {
  playClassName: string;
  pauseClassName: string;
  stopClassName: string;
  playDisabled: boolean;
  pauseDisabled: boolean;
  stopDisabled: boolean;
  playMode:
    | "workshop_paid"
    | "trial_reserved"
    | "trial_checked_in"
    | "trial_approved"
    | "registered_active"
    | "registered_pause_scheduled"
    | "registered_paused"
    | "registered_cancel_scheduled"
    | "registered_cancelled"
    | "workshop_reserved"
    | "workshop_checked_in"
    | "workshop_cancelled"
    | "inactive";
};

export function getParticipantLifecycleDisplay(input: ParticipantLifecycleInput): ParticipantLifecycleDisplay {
  if (input.hasCompletedRegistration) {
    const subscriptionStatus = input.subscriptionStatus ?? "active";

    if (subscriptionStatus === "pause_scheduled") {
      return {
        playClassName: DISABLED_OFFER_ACTION_ICON_CLASS,
        pauseClassName: PAUSE_OUTLINE_CLASS,
        stopClassName: AVAILABLE_ACTION_CLASS,
        playDisabled: true,
        pauseDisabled: true,
        stopDisabled: false,
        playMode: "registered_pause_scheduled",
      };
    }

    if (subscriptionStatus === "paused") {
      return {
        playClassName: DISABLED_OFFER_ACTION_ICON_CLASS,
        pauseClassName: PAUSE_FILLED_CLASS,
        stopClassName: AVAILABLE_ACTION_CLASS,
        playDisabled: true,
        pauseDisabled: true,
        stopDisabled: false,
        playMode: "registered_paused",
      };
    }

    if (subscriptionStatus === "cancel_scheduled") {
      return {
        playClassName: DISABLED_OFFER_ACTION_ICON_CLASS,
        pauseClassName: DISABLED_OFFER_ACTION_ICON_CLASS,
        stopClassName: STOP_OUTLINE_CLASS,
        playDisabled: true,
        pauseDisabled: true,
        stopDisabled: true,
        playMode: "registered_cancel_scheduled",
      };
    }

    if (subscriptionStatus === "cancelled" || subscriptionStatus === "inactive") {
      return {
        playClassName: DISABLED_OFFER_ACTION_ICON_CLASS,
        pauseClassName: DISABLED_OFFER_ACTION_ICON_CLASS,
        stopClassName: STOP_FILLED_CLASS,
        playDisabled: true,
        pauseDisabled: true,
        stopDisabled: true,
        playMode: "registered_cancelled",
      };
    }

    return {
      playClassName: ACTIVE_FILLED_CLASS,
      pauseClassName: AVAILABLE_ACTION_CLASS,
      stopClassName: AVAILABLE_ACTION_CLASS,
      playDisabled: true,
      pauseDisabled: false,
      stopDisabled: false,
      playMode: "registered_active",
    };
  }

  if (input.reservationCancelledAt || input.reservationDecisionStatus === "rejected") {
    return {
      playClassName: DISABLED_OFFER_ACTION_ICON_CLASS,
      pauseClassName: DISABLED_OFFER_ACTION_ICON_CLASS,
      stopClassName: STOP_FILLED_CLASS,
      playDisabled: true,
      pauseDisabled: true,
      stopDisabled: true,
      playMode: "inactive",
    };
  }

  if (input.reservationDecisionStatus === "approved") {
    return {
      playClassName: ACTIVE_OUTLINE_CLASS,
      pauseClassName: DISABLED_OFFER_ACTION_ICON_CLASS,
      stopClassName: AVAILABLE_ACTION_CLASS,
      playDisabled: true,
      pauseDisabled: true,
      stopDisabled: false,
      playMode: "trial_approved",
    };
  }

  if (input.trialTicketStatus === "checked_in") {
    return {
      playClassName: ACTIVE_OUTLINE_CLASS,
      pauseClassName: DISABLED_OFFER_ACTION_ICON_CLASS,
      stopClassName: AVAILABLE_ACTION_CLASS,
      playDisabled: false,
      pauseDisabled: true,
      stopDisabled: false,
      playMode: "trial_checked_in",
    };
  }

  return {
    playClassName: ACTIVE_OUTLINE_CLASS,
    pauseClassName: DISABLED_OFFER_ACTION_ICON_CLASS,
    stopClassName: AVAILABLE_ACTION_CLASS,
    playDisabled: true,
    pauseDisabled: true,
    stopDisabled: false,
    playMode: "trial_reserved",
  };
}

export function getWorkshopParticipantLifecycleDisplay(input: {
  bookingStatus: string | null;
  checkedInAt?: string | null;
  refundedAt?: string | null;
  stripeRefundId?: string | null;
}): ParticipantLifecycleDisplay {
  const isCancelled =
    input.bookingStatus !== "paid" ||
    Boolean(input.refundedAt) ||
    Boolean(input.stripeRefundId);

  if (isCancelled) {
    return {
      playClassName: DISABLED_OFFER_ACTION_ICON_CLASS,
      pauseClassName: DISABLED_OFFER_ACTION_ICON_CLASS,
      stopClassName: STOP_FILLED_CLASS,
      playDisabled: true,
      pauseDisabled: true,
      stopDisabled: true,
      playMode: "workshop_cancelled",
    };
  }

  if (input.checkedInAt) {
    return {
      playClassName: ACTIVE_FILLED_CLASS,
      pauseClassName: DISABLED_OFFER_ACTION_ICON_CLASS,
      stopClassName: AVAILABLE_ACTION_CLASS,
      playDisabled: true,
      pauseDisabled: true,
      stopDisabled: false,
      playMode: "workshop_checked_in",
    };
  }

  return {
    playClassName: ACTIVE_FILLED_CLASS,
    pauseClassName: DISABLED_OFFER_ACTION_ICON_CLASS,
    stopClassName: AVAILABLE_ACTION_CLASS,
    playDisabled: true,
    pauseDisabled: true,
    stopDisabled: false,
    playMode: "workshop_reserved",
  };
}
