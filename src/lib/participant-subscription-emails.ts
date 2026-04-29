import { sendResendEmail } from "@/lib/resend";

type ParticipantSubscriptionPauseEmailData = {
  courseTitle: string;
  customerName: string;
  customerEmail: string;
  pauseStartDateLabel: string;
  pauseEndDateLabel: string;
};

type ParticipantSubscriptionCancellationEmailData = {
  courseTitle: string;
  customerName: string;
  customerEmail: string;
  cancellationDateLabel: string;
};

export async function sendParticipantPauseConfirmationEmail(
  data: ParticipantSubscriptionPauseEmailData
) {
  return sendResendEmail({
    to: data.customerEmail,
    subject: "Bestaetigung deiner Kurspause",
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <p>Hallo ${data.customerName},</p>
        <p>deine Teilnahme am Kurs <strong>${data.courseTitle}</strong> wurde pausiert.</p>
        <p>Die Pause gilt vom ${data.pauseStartDateLabel} bis ${data.pauseEndDateLabel}.</p>
        <p>In diesem Zeitraum erfolgen keine Abbuchungen. Danach wird die Teilnahme automatisch fortgesetzt.</p>
      </div>
    `,
    text: `Hallo ${data.customerName},\n\ndeine Teilnahme am Kurs ${data.courseTitle} wurde pausiert.\nDie Pause gilt vom ${data.pauseStartDateLabel} bis ${data.pauseEndDateLabel}.\nIn diesem Zeitraum erfolgen keine Abbuchungen. Danach wird die Teilnahme automatisch fortgesetzt.`,
  });
}

export async function sendParticipantCancellationConfirmationEmail(
  data: ParticipantSubscriptionCancellationEmailData
) {
  return sendResendEmail({
    to: data.customerEmail,
    subject: "Bestaetigung deiner Kuendigung",
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <p>Hallo ${data.customerName},</p>
        <p>deine Teilnahme am Kurs <strong>${data.courseTitle}</strong> wurde zum Periodenende beendet.</p>
        <p>Die Teilnahme endet nach dem bereits bezahlten Zeitraum am ${data.cancellationDateLabel}.</p>
      </div>
    `,
    text: `Hallo ${data.customerName},\n\ndeine Teilnahme am Kurs ${data.courseTitle} wurde zum Periodenende beendet.\nDie Teilnahme endet nach dem bereits bezahlten Zeitraum am ${data.cancellationDateLabel}.`,
  });
}
