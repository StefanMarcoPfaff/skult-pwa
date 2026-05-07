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
    subject: "Dein laufendes Angebot pausiert vorübergehend",
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <p>Hallo ${data.customerName},</p>
        <p>dein laufendes Angebot <strong>${data.courseTitle}</strong> pausiert vorübergehend.</p>
        <p>Das Angebot läuft noch bis ${data.activeUntilDateLabel} und pausiert anschließend vom ${data.pauseStartDateLabel} bis ${data.pauseEndExclusiveDateLabel}.</p>
        <p>Ab ${data.pauseEndDateLabel} geht es weiter. Während der Pause wird keine Gebühr abgebucht.</p>
      </div>
    `,
    text: `Hallo ${data.customerName},\n\ndein laufendes Angebot ${data.courseTitle} pausiert vorübergehend.\nDas Angebot läuft noch bis ${data.activeUntilDateLabel} und pausiert anschließend vom ${data.pauseStartDateLabel} bis ${data.pauseEndExclusiveDateLabel}.\nAb ${data.pauseEndDateLabel} geht es weiter. Während der Pause wird keine Gebühr abgebucht.`,
  });
}

export async function sendCourseStopNotificationEmail(data: CourseStopNotificationEmailData) {
  return sendResendEmail({
    to: data.customerEmail,
    subject: "Dein laufendes Angebot endet",
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <p>Hallo ${data.customerName},</p>
        <p>dein laufendes Angebot <strong>${data.courseTitle}</strong> endet zum ${data.stopDateLabel}.</p>
        <p>Ab dem Folgemonat wird keine Gebühr mehr abgebucht. Du findest weitere Angebote auf RESER.</p>
      </div>
    `,
    text: `Hallo ${data.customerName},\n\ndein laufendes Angebot ${data.courseTitle} endet zum ${data.stopDateLabel}.\nAb dem Folgemonat wird keine Gebühr mehr abgebucht. Du findest weitere Angebote auf RESER.`,
  });
}
