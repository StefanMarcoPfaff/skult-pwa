import { loadProviderPayoutAttachmentsForMail } from "@/lib/documents/financial-document-mail-attachments";
import { sendResendEmail } from "@/lib/resend";

function formatMoney(cents: number, currency: string | null | undefined): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: currency?.trim().toUpperCase() || "EUR",
  }).format(cents / 100);
}

function normalizeText(value: string | null | undefined, fallback: string): string {
  const trimmed = String(value ?? "").trim();
  return trimmed || fallback;
}

export async function sendProviderPayoutReceivedEmail(input: {
  to: string;
  payoutAmountCents: number;
  currency: string;
  payoutBatchId: string | null;
  payoutItemId: string | null;
  ledgerEntryId: string;
  offerTitle?: string | null;
  seatCount?: number | null;
  grossAmountCents?: number | null;
  platformFeeCents?: number | null;
  requireAttachments?: boolean;
}) {
  const attachments = await loadProviderPayoutAttachmentsForMail({
    context: "provider_payout_received",
    query: {
      ledgerEntryId: input.ledgerEntryId,
      payoutBatchId: input.payoutBatchId,
      payoutItemId: input.payoutItemId,
    },
  });
  if (input.requireAttachments && attachments.length < 2) {
    throw new Error(`Provider payout attachments missing for ledger entry ${input.ledgerEntryId}`);
  }

  const amount = formatMoney(input.payoutAmountCents, input.currency);
  const offerTitle = normalizeText(input.offerTitle, "dein Angebot");
  const grossAmount = formatMoney(input.grossAmountCents ?? 0, input.currency);
  const platformFee = formatMoney(input.platformFeeCents ?? 0, input.currency);
  const seatCount = Math.max(0, input.seatCount ?? 0);
  const seatLine = seatCount > 0 ? `<li>Gebuchte Plaetze: <b>${seatCount}</b></li>` : "";
  const textSeatLine = seatCount > 0 ? [`Gebuchte Plaetze: ${seatCount}`] : [];

  return sendResendEmail({
    to: input.to,
    subject: "Du hast eine Auszahlung erhalten",
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827; max-width: 640px;">
        <h2 style="margin: 0 0 18px; font-size: 24px;">Du hast eine Auszahlung erhalten</h2>
        <p style="margin: 0 0 14px;">Die Auszahlung fuer <b>${offerTitle}</b> wurde 24 Stunden nach Angebotsende ausgelost.</p>
        <ul style="margin: 0 0 14px; padding-left: 18px;">
          ${seatLine}
          <li>Bruttoeinnahmen: <b>${grossAmount}</b></li>
          <li>RESER-Plattformgebuehr: <b>${platformFee}</b></li>
          <li>Auszahlungsbetrag: <b>${amount}</b></li>
        </ul>
        <p style="margin: 0;">Im Anhang findest du deinen Auszahlungs-/Abrechnungsbeleg und den Beleg ueber die RESER-Plattformgebuehr.</p>
      </div>
    `,
    text: [
      "Du hast eine Auszahlung erhalten",
      "",
      `Die Auszahlung fuer ${offerTitle} wurde 24 Stunden nach Angebotsende ausgelost.`,
      ...textSeatLine,
      `Bruttoeinnahmen: ${grossAmount}`,
      `RESER-Plattformgebuehr: ${platformFee}`,
      `Auszahlungsbetrag: ${amount}`,
      "Im Anhang findest du deinen Auszahlungs-/Abrechnungsbeleg und den Beleg ueber die RESER-Plattformgebuehr.",
    ].join("\n"),
    attachments,
  });
}
