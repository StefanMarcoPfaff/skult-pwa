import { sendResendEmail } from "@/lib/resend";

type CourseLifecycleRecipientEmailData = {
  courseTitle: string;
  customerName: string;
  customerEmail: string;
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

export async function sendCoursePauseNotificationEmail(data: CoursePauseNotificationEmailData) {
  return sendResendEmail({
    to: data.customerEmail,
    subject: "Dein Kurs pausiert vorübergehend",
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <p>Hallo ${data.customerName},</p>
        <p>dein Kurs <strong>${data.courseTitle}</strong> pausiert vorübergehend.</p>
        <p>Der Kurs läuft noch bis ${data.activeUntilDateLabel} und pausiert anschließend vom ${data.pauseStartDateLabel} bis ${data.pauseEndExclusiveDateLabel}.</p>
        <p>Ab ${data.pauseEndDateLabel} geht es weiter. Während der Pause wird keine Kursgebühr abgebucht.</p>
      </div>
    `,
    text: `Hallo ${data.customerName},\n\ndein Kurs ${data.courseTitle} pausiert vorübergehend.\nDer Kurs läuft noch bis ${data.activeUntilDateLabel} und pausiert anschließend vom ${data.pauseStartDateLabel} bis ${data.pauseEndExclusiveDateLabel}.\nAb ${data.pauseEndDateLabel} geht es weiter. Während der Pause wird keine Kursgebühr abgebucht.`,
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
        <p>Ab dem Folgemonat wird keine Kursgebühr mehr abgebucht. Du findest weitere Kurse und Workshops auf RESER.</p>
      </div>
    `,
    text: `Hallo ${data.customerName},\n\ndein Kurs ${data.courseTitle} endet zum ${data.stopDateLabel}.\nAb dem Folgemonat wird keine Kursgebühr mehr abgebucht. Du findest weitere Kurse und Workshops auf RESER.`,
  });
}
