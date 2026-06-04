import { buildOfferViewModel, type OfferViewModel } from "@/lib/offers/offer-view-model";
import { sendStatusChangeEmail } from "@/lib/status-change-emails";

type CourseLifecycleRecipientEmailData = {
  courseTitle: string;
  customerName: string;
  customerEmail: string;
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

export async function sendCourseStopNotificationEmail(data: CourseStopNotificationEmailData) {
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
      effectiveDateLabel: data.stopDateLabel,
    },
  });
}
