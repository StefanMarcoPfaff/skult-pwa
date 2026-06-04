import { buildOfferViewModel, type OfferViewModel } from "@/lib/offers/offer-view-model";
import { sendStatusChangeEmail } from "@/lib/status-change-emails";

type ParticipantSubscriptionPauseEmailData = {
  courseTitle: string;
  customerName: string;
  customerEmail: string;
  providerEmail?: string | null;
  providerName?: string | null;
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
  providerEmail?: string | null;
  providerName?: string | null;
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
  const offer = data.offer ?? buildFallbackCourseOfferViewModel(data.courseTitle);
  const participantResult = await sendStatusChangeEmail({
    to: data.customerEmail,
    audience: "participant",
    status: "paused",
    statusLabel: "Pausiert",
    greetingName: data.customerName,
    participantName: data.customerName,
    participantEmail: data.customerEmail,
    offer,
    details: {
      pauseStartLabel: data.pauseStartDateLabel,
      pauseEndLabel: data.pauseEndExclusiveDateLabel,
    },
    replyTo: data.providerEmail ?? undefined,
  });

  if (data.providerEmail) {
    await sendStatusChangeEmail({
      to: data.providerEmail,
      audience: "provider",
      status: "paused",
      statusLabel: "Pausiert",
      greetingName: data.providerName ?? undefined,
      participantName: data.customerName,
      participantEmail: data.customerEmail,
      offer,
      details: {
        pauseStartLabel: data.pauseStartDateLabel,
        pauseEndLabel: data.pauseEndExclusiveDateLabel,
      },
      replyTo: data.providerEmail,
    });
  }

  return participantResult;
}

export async function sendParticipantCancellationConfirmationEmail(
  data: ParticipantSubscriptionCancellationEmailData
) {
  const offer = data.offer ?? buildFallbackCourseOfferViewModel(data.courseTitle);
  const participantResult = await sendStatusChangeEmail({
    to: data.customerEmail,
    audience: "participant",
    status: "terminated",
    statusLabel: "Beendet",
    greetingName: data.customerName,
    participantName: data.customerName,
    participantEmail: data.customerEmail,
    offer,
    details: {
      effectiveDateLabel: data.cancellationDateLabel,
    },
    replyTo: data.providerEmail ?? undefined,
  });

  if (data.providerEmail) {
    await sendStatusChangeEmail({
      to: data.providerEmail,
      audience: "provider",
      status: "terminated",
      statusLabel: "Beendet",
      greetingName: data.providerName ?? undefined,
      participantName: data.customerName,
      participantEmail: data.customerEmail,
      offer,
      details: {
        effectiveDateLabel: data.cancellationDateLabel,
      },
      replyTo: data.providerEmail,
    });
  }

  return participantResult;
}
