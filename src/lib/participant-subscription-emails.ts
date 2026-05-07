import { sendResendEmail } from "@/lib/resend";

type ParticipantSubscriptionPauseEmailData = {
  courseTitle: string;
  customerName: string;
  customerEmail: string;
  activeUntilDateLabel: string;
  pauseStartDateLabel: string;
  pauseEndDateLabel: string;
  pauseEndExclusiveDateLabel: string;
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
    subject: "Bestaetigung deiner Angebotspause",
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <p>Hallo ${data.customerName},</p>
        <p>deine Teilnahme am laufenden Angebot <strong>${data.courseTitle}</strong> pausiert vorübergehend.</p>
        <p>Deine Teilnahme läuft noch bis ${data.activeUntilDateLabel}.</p>
        <p>Vom ${data.pauseStartDateLabel} bis ${data.pauseEndExclusiveDateLabel} erfolgen keine Abbuchungen.</p>
        <p>Ab ${data.pauseEndDateLabel} läuft dein Abo wieder weiter.</p>
      </div>
    `,
    text: `Hallo ${data.customerName},\n\ndeine Teilnahme am laufenden Angebot ${data.courseTitle} pausiert vorübergehend.\nDeine Teilnahme läuft noch bis ${data.activeUntilDateLabel}.\nVom ${data.pauseStartDateLabel} bis ${data.pauseEndExclusiveDateLabel} erfolgen keine Abbuchungen.\nAb ${data.pauseEndDateLabel} läuft dein Abo wieder weiter.`,
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
        <p>deine Teilnahme am laufenden Angebot <strong>${data.courseTitle}</strong> endet zum ${data.cancellationDateLabel}.</p>
        <p>Ab dem Folgemonat wird keine Gebühr mehr abgebucht.</p>
      </div>
    `,
    text: `Hallo ${data.customerName},\n\ndeine Teilnahme am laufenden Angebot ${data.courseTitle} endet zum ${data.cancellationDateLabel}.\nAb dem Folgemonat wird keine Gebühr mehr abgebucht.`,
  });
}
