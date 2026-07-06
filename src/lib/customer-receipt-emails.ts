import { loadCustomerReceiptAttachmentForMail } from "@/lib/documents/financial-document-mail-attachments";
import { sendResendEmail } from "@/lib/resend";

function normalizeText(value: string | null | undefined, fallback: string): string {
  const trimmed = String(value ?? "").trim();
  return trimmed || fallback;
}

export async function sendCustomerReceiptEmail(input: {
  to: string;
  customerName: string | null;
  offerTitle: string | null;
  bookingId: string | null;
  paymentTransactionId: string;
}) {
  const attachments = await loadCustomerReceiptAttachmentForMail({
    context: "customer_receipt_after_provider_transfer",
    query: {
      bookingId: input.bookingId,
      paymentTransactionId: input.paymentTransactionId,
    },
  });
  if (attachments.length === 0) {
    throw new Error(`Customer receipt attachment missing for payment transaction ${input.paymentTransactionId}`);
  }

  const offerTitle = normalizeText(input.offerTitle, "deine Buchung");
  const greetingName = normalizeText(input.customerName, "");
  const greeting = greetingName ? `Hallo ${greetingName},` : "Hallo,";

  return sendResendEmail({
    to: input.to,
    subject: `Dein Beleg fuer ${offerTitle}`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827; max-width: 640px;">
        <p style="margin: 0 0 14px;">${greeting}</p>
        <p style="margin: 0 0 14px;">im Anhang findest du den Beleg fuer <b>${offerTitle}</b>.</p>
        <p style="margin: 0;">Bei Mehrpersonen-Buchungen senden wir den Beleg an die buchende Person.</p>
      </div>
    `,
    text: [
      greeting,
      "",
      `Im Anhang findest du den Beleg fuer ${offerTitle}.`,
      "Bei Mehrpersonen-Buchungen senden wir den Beleg an die buchende Person.",
    ].join("\n"),
    attachments,
  });
}
