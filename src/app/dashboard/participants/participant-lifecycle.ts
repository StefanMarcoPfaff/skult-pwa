import { DISABLED_OFFER_ACTION_ICON_CLASS } from "@/app/dashboard/courses/display-status";

const ACTIVE_FILLED_CLASS = "border-green-600 bg-green-600 text-white";
const ACTIVE_OUTLINE_CLASS = "border-green-600 bg-background text-green-700";
const PAUSE_CLASS = "border-orange-500 bg-orange-500 text-white";
const STOP_CLASS = "border-red-600 bg-red-600 text-white";

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
    | "registered_paused"
    | "registered_cancel_scheduled"
    | "inactive";
};

export function getParticipantLifecycleDisplay(input: ParticipantLifecycleInput): ParticipantLifecycleDisplay {
  if (input.hasCompletedRegistration) {
    const subscriptionStatus = input.subscriptionStatus ?? "active";

    if (subscriptionStatus === "paused" || subscriptionStatus === "pause_scheduled") {
      return {
        playClassName: DISABLED_OFFER_ACTION_ICON_CLASS,
        pauseClassName: PAUSE_CLASS,
        stopClassName: STOP_CLASS,
        playDisabled: true,
        pauseDisabled: false,
        stopDisabled: false,
        playMode: "registered_paused",
      };
    }

    if (subscriptionStatus === "cancel_scheduled" || subscriptionStatus === "cancelled") {
      return {
        playClassName: subscriptionStatus === "cancelled" ? DISABLED_OFFER_ACTION_ICON_CLASS : ACTIVE_FILLED_CLASS,
        pauseClassName: DISABLED_OFFER_ACTION_ICON_CLASS,
        stopClassName: STOP_CLASS,
        playDisabled: true,
        pauseDisabled: true,
        stopDisabled: subscriptionStatus === "cancelled",
        playMode: "registered_cancel_scheduled",
      };
    }

    return {
      playClassName: ACTIVE_FILLED_CLASS,
      pauseClassName: PAUSE_CLASS,
      stopClassName: STOP_CLASS,
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
      stopClassName: STOP_CLASS,
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
      stopClassName: DISABLED_OFFER_ACTION_ICON_CLASS,
      playDisabled: true,
      pauseDisabled: true,
      stopDisabled: true,
      playMode: "trial_approved",
    };
  }

  if (input.trialTicketStatus === "checked_in") {
    return {
      playClassName: ACTIVE_OUTLINE_CLASS,
      pauseClassName: DISABLED_OFFER_ACTION_ICON_CLASS,
      stopClassName: STOP_CLASS,
      playDisabled: false,
      pauseDisabled: true,
      stopDisabled: false,
      playMode: "trial_checked_in",
    };
  }

  return {
    playClassName: ACTIVE_OUTLINE_CLASS,
    pauseClassName: DISABLED_OFFER_ACTION_ICON_CLASS,
    stopClassName: STOP_CLASS,
    playDisabled: true,
    pauseDisabled: true,
    stopDisabled: false,
    playMode: "trial_reserved",
  };
}

export function getWorkshopParticipantLifecycleDisplay(paid: boolean): ParticipantLifecycleDisplay {
  return {
    playClassName: paid ? ACTIVE_FILLED_CLASS : DISABLED_OFFER_ACTION_ICON_CLASS,
    pauseClassName: DISABLED_OFFER_ACTION_ICON_CLASS,
    stopClassName: DISABLED_OFFER_ACTION_ICON_CLASS,
    playDisabled: true,
    pauseDisabled: true,
    stopDisabled: true,
    playMode: paid ? "workshop_paid" : "inactive",
  };
}
