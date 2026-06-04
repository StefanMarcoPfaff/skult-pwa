import { buildOfferViewModel, type OfferViewModel } from "@/lib/offers/offer-view-model";
import { sendStatusChangeEmail } from "@/lib/status-change-emails";

type CourseLifecycleRecipientEmailData = {
  courseTitle: string;
  customerName: string;
  customerEmail: string;
  providerEmail?: string | null;
  providerName?: string | null;
  offer?: OfferViewModel | null;
};

type CoursePauseNotificationEmailData = CourseLifecycleRecipientEmailData & {
  activeUntilDateLabel: string;
  pauseStartDateLabel: string;
  pauseEndDateLabel: string;
  pauseEndExclusiveDateLabel: string;
};

type CourseStopNotificationEmailData = CourseLifecycleRecipientEmailData & {
  stopDateLabel: string;
};

function buildFallbackCourseOfferViewModel(courseTitle: string): OfferViewModel {
  return buildOfferViewModel({
    course: {
      title: courseTitle,
      kind: "course",
    },
  });
}

export async function sendCoursePauseNotificationEmail(data: CoursePauseNotificationEmailData) {
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
      statusLabel: "Angebot pausiert",
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

export async function sendCourseStopNotificationEmail(data: CourseStopNotificationEmailData) {
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
      effectiveDateLabel: data.stopDateLabel,
    },
    replyTo: data.providerEmail ?? undefined,
  });

  if (data.providerEmail) {
    await sendStatusChangeEmail({
      to: data.providerEmail,
      audience: "provider",
      status: "terminated",
      statusLabel: "Angebot beendet",
      greetingName: data.providerName ?? undefined,
      participantName: data.customerName,
      participantEmail: data.customerEmail,
      offer,
      details: {
        effectiveDateLabel: data.stopDateLabel,
      },
      replyTo: data.providerEmail,
    });
  }

  return participantResult;
}
