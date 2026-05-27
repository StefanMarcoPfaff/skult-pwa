import { loadProviderPayoutAttachmentsForMail } from "@/lib/documents/financial-document-mail-attachments";
import { sendResendEmail } from "@/lib/resend";

function formatMoney(cents: number, currency: string | null | undefined): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: currency?.trim().toUpperCase() || "EUR",
  }).format(cents / 100);
}

export async function sendProviderPayoutReceivedEmail(input: {
  to: string;
  payoutAmountCents: number;
  currency: string;
  payoutBatchId: string | null;
  payoutItemId: string | null;
  ledgerEntryId: string;
}) {
  const attachments = await loadProviderPayoutAttachmentsForMail({
    context: "provider_payout_received",
    query: {
      ledgerEntryId: input.ledgerEntryId,
      payoutBatchId: input.payoutBatchId,
      payoutItemId: input.payoutItemId,
    },
  });
  const amount = formatMoney(input.payoutAmountCents, input.currency);

  return sendResendEmail({
    to: input.to,
    subject: "Du hast eine Auszahlung erhalten",
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827; max-width: 640px;">
        <h2 style="margin: 0 0 18px; font-size: 24px;">Du hast eine Auszahlung erhalten</h2>
        <p style="margin: 0 0 14px;">Wir haben eine Auszahlung in Hoehe von <b>${amount}</b> fuer dich verbucht.</p>
        <p style="margin: 0;">Die Abrechnungsdokumente findest du im Anhang, sofern sie bereits als PDF vorliegen.</p>
      </div>
    `,
    text: [
      "Du hast eine Auszahlung erhalten",
      "",
      `Wir haben eine Auszahlung in Hoehe von ${amount} fuer dich verbucht.`,
      "Die Abrechnungsdokumente findest du im Anhang, sofern sie bereits als PDF vorliegen.",
    ].join("\n"),
    attachments,
  });
}

