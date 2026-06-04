import { buildOfferViewModel, type OfferViewModel } from "@/lib/offers/offer-view-model";
import { sendStatusChangeEmail } from "@/lib/status-change-emails";

type ParticipantSubscriptionPauseEmailData = {
  courseTitle: string;
  customerName: string;
  customerEmail: string;
  activeUntilDateLabel: string;
  pauseStartDateLabel: string;
  pauseEndDateLabel: string;
  pauseEndExclusiveDateLabel: string;
  offer?: OfferViewModel | null;
};

type ParticipantSubscriptionCancellationEmailData = {
  courseTitle: string;
  customerName: string;
  customerEmail: string;
  cancellationDateLabel: string;
  offer?: OfferViewModel | null;
};

function buildFallbackCourseOfferViewModel(courseTitle: string): OfferViewModel {
  return buildOfferViewModel({
    course: {
      title: courseTitle,
      kind: "course",
    },
  });
}

export async function sendParticipantPauseConfirmationEmail(data: ParticipantSubscriptionPauseEmailData) {
  return sendStatusChangeEmail({
    to: data.customerEmail,
    audience: "participant",
    status: "paused",
    statusLabel: "Pausiert",
    greetingName: data.customerName,
    participantName: data.customerName,
    participantEmail: data.customerEmail,
    offer: data.offer ?? buildFallbackCourseOfferViewModel(data.courseTitle),
    details: {
      pauseStartLabel: data.pauseStartDateLabel,
      pauseEndLabel: data.pauseEndExclusiveDateLabel,
    },
  });
}

export async function sendParticipantCancellationConfirmationEmail(
  data: ParticipantSubscriptionCancellationEmailData
) {
  return sendStatusChangeEmail({
    to: data.customerEmail,
    audience: "participant",
    status: "terminated",
    statusLabel: "Beendet",
    greetingName: data.customerName,
    participantName: data.customerName,
    participantEmail: data.customerEmail,
    offer: data.offer ?? buildFallbackCourseOfferViewModel(data.courseTitle),
    details: {
      effectiveDateLabel: data.cancellationDateLabel,
    },
  });
}
