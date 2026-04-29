import { sendResendEmail } from "@/lib/resend";

type CourseLifecycleRecipientEmailData = {
  courseTitle: string;
  customerName: string;
  customerEmail: string;
};

type CoursePauseNotificationEmailData = CourseLifecycleRecipientEmailData & {
  pauseStartDateLabel: string;
  pauseEndDateLabel: string;
};

type CourseStopNotificationEmailData = CourseLifecycleRecipientEmailData & {
  stopDateLabel: string;
};

export async function sendCoursePauseNotificationEmail(data: CoursePauseNotificationEmailData) {
  return sendResendEmail({
    to: data.customerEmail,
    subject: "Dein Kurs pausiert vorübergehend",
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <p>Hallo ${data.customerName},</p>
        <p>dein Kurs <strong>${data.courseTitle}</strong> pausiert vom ${data.pauseStartDateLabel} bis ${data.pauseEndDateLabel}.</p>
        <p>In diesem Zeitraum erfolgen keine Abbuchungen.</p>
        <p>Der Kurs startet wieder am ${data.pauseEndDateLabel}.</p>
      </div>
    `,
    text: `Hallo ${data.customerName},\n\ndein Kurs ${data.courseTitle} pausiert vom ${data.pauseStartDateLabel} bis ${data.pauseEndDateLabel}.\nIn diesem Zeitraum erfolgen keine Abbuchungen.\nDer Kurs startet wieder am ${data.pauseEndDateLabel}.`,
  });
}

export async function sendCourseStopNotificationEmail(data: CourseStopNotificationEmailData) {
  return sendResendEmail({
    to: data.customerEmail,
    subject: "Dein Kurs endet",
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <p>Hallo ${data.customerName},</p>
        <p>dein Kurs <strong>${data.courseTitle}</strong> endet zum ${data.stopDateLabel}.</p>
        <p>Ab diesem Zeitpunkt finden keine weiteren Termine statt und es erfolgen keine weiteren Abbuchungen.</p>
      </div>
    `,
    text: `Hallo ${data.customerName},\n\ndein Kurs ${data.courseTitle} endet zum ${data.stopDateLabel}.\nAb diesem Zeitpunkt finden keine weiteren Termine statt und es erfolgen keine weiteren Abbuchungen.`,
  });
}
