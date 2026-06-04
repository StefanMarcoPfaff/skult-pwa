import { RESER_BRAND_NAME, RESER_BRAND_TAGLINE } from "@/lib/brand";
import type { OfferViewModel } from "@/lib/offers/offer-view-model";
import { renderOfferSummaryEmailHtml, renderOfferSummaryEmailText } from "@/lib/offers/offer-view-model";
import { sendResendEmail } from "@/lib/resend";

export type StatusMailStatus =
  | "cancelled"
  | "paused"
  | "terminated"
  | "approved"
  | "rejected"
  | "refunded"
  | "archived"
  | (string & {});

export type StatusMailAudience = "participant" | "provider";

export type StatusMailFinancialImpact = {
  participantRefundLabel?: string | null;
  providerRefundLabel?: string | null;
  providerPayoutImpactLabel?: string | null;
  note?: string | null;
};

export type StatusMailDetails = {
  pauseStartLabel?: string | null;
  pauseEndLabel?: string | null;
  effectiveDateLabel?: string | null;
};

export type StatusChangeEmailInput = {
  to: string;
  audience: StatusMailAudience;
  status: StatusMailStatus;
  statusLabel?: string | null;
  greetingName?: string | null;
  participantName?: string | null;
  participantEmail?: string | null;
  offer: OfferViewModel;
  details?: StatusMailDetails;
  financialImpact?: StatusMailFinancialImpact | null;
  subject?: string | null;
  replyTo?: string | null;
};

type InfoItem = {
  label: string;
  value: string | null | undefined;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getStatusLabel(status: StatusMailStatus, fallback?: string | null): string {
  if (fallback?.trim()) return fallback.trim();
  switch (status) {
    case "cancelled":
      return "Storniert";
    case "paused":
      return "Pausiert";
    case "terminated":
      return "Beendet";
    case "approved":
      return "Freigegeben";
    case "rejected":
      return "Abgelehnt";
    case "refunded":
      return "Erstattet";
    case "archived":
      return "Archiviert";
    default:
      return status;
  }
}

function buildStatusSentence(input: StatusChangeEmailInput): string {
  const participantName = input.participantName?.trim() || "Teilnehmende";
  const subject =
    input.audience === "provider"
      ? `Die Teilnahme von ${participantName} am Angebot`
      : "Deine Teilnahme am Angebot";
  const offerTitle = `"${input.offer.offerTitle}"`;

  switch (input.status) {
    case "cancelled":
      return `${subject} ${offerTitle} wurde storniert.`;
    case "paused":
      if (input.details?.pauseStartLabel && input.details.pauseEndLabel) {
        return `${subject} ${offerTitle} wurde vom ${input.details.pauseStartLabel} bis ${input.details.pauseEndLabel} pausiert.`;
      }
      return `${subject} ${offerTitle} wurde pausiert.`;
    case "terminated":
      if (input.details?.effectiveDateLabel) {
        return `${subject} ${offerTitle} wurde zum ${input.details.effectiveDateLabel} beendet.`;
      }
      return `${subject} ${offerTitle} wurde beendet.`;
    case "approved":
      return `${subject} ${offerTitle} wurde freigegeben.`;
    case "rejected":
      return `${subject} ${offerTitle} wurde abgelehnt.`;
    case "refunded":
      return `${subject} ${offerTitle} wurde erstattet.`;
    case "archived":
      return `${subject} ${offerTitle} wurde archiviert.`;
    default:
      return `${subject} ${offerTitle} wurde auf den Status "${getStatusLabel(input.status, input.statusLabel)}" gesetzt.`;
  }
}

function buildFinancialItems(input: StatusChangeEmailInput): InfoItem[] {
  const financialImpact = input.financialImpact;
  if (!financialImpact) return [];

  if (input.audience === "provider") {
    return [
      { label: "Erstattung an Teilnehmende", value: financialImpact.providerRefundLabel },
      { label: "Auswirkung auf Deine Auszahlung", value: financialImpact.providerPayoutImpactLabel },
    ];
  }

  return [{ label: "Rückerstattung", value: financialImpact.participantRefundLabel }];
}

function hasFinancialBlock(input: StatusChangeEmailInput): boolean {
  return buildFinancialItems(input).some((item) => item.value);
}

function renderInfoBlockHtml(title: string, items: InfoItem[], note?: string | null): string {
  const visibleItems = items.filter((item) => item.value);
  if (visibleItems.length === 0 && !note) return "";

  return `
    <div style="margin:24px 0;padding:18px 20px;border:1px solid #e5e7eb;border-radius:14px;background:#f8fafc;">
      <p style="margin:0 0 14px;font-weight:700;color:#111827;">${escapeHtml(title)}</p>
      ${visibleItems
        .map(
          (item) => `
            <div style="margin:0 0 12px;">
              <div style="font-size:12px;line-height:1.35;color:#5b6470;font-weight:700;">${escapeHtml(item.label)}</div>
              <div style="margin-top:3px;color:#111827;">${escapeHtml(item.value ?? "")}</div>
            </div>
          `
        )
        .join("")}
      ${note ? `<p style="margin:4px 0 0;color:#4b5563;">${escapeHtml(note)}</p>` : ""}
    </div>
  `;
}

function renderInfoBlockText(title: string, items: InfoItem[], note?: string | null): string | null {
  const visibleItems = items.filter((item) => item.value);
  if (visibleItems.length === 0 && !note) return null;

  return [
    title,
    ...visibleItems.map((item) => `${item.label}: ${item.value}`),
    note ?? null,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildProviderItems(input: StatusChangeEmailInput): InfoItem[] {
  if (input.audience !== "provider") return [];
  return [
    { label: "Teilnehmende", value: input.participantName },
    { label: "E-Mail", value: input.participantEmail },
    { label: "Status", value: getStatusLabel(input.status, input.statusLabel) },
  ];
}

function renderFooterHtml() {
  return `
    <div style="margin:24px 0 0;text-align:center;color:#111827;">
      <p style="margin:0;">Herzliche Grüße,</p>
      <p style="margin:10px 0 0;font-weight:700;">${RESER_BRAND_NAME}</p>
      <p style="margin:4px 0 0;color:#4b5563;">${RESER_BRAND_TAGLINE}</p>
    </div>
  `;
}

function renderFooterText() {
  return ["Herzliche Grüße,", RESER_BRAND_NAME, RESER_BRAND_TAGLINE].join("\n");
}

export function prepareStatusChangeEmail(input: StatusChangeEmailInput) {
  const statusLabel = getStatusLabel(input.status, input.statusLabel);
  const statusSentence = buildStatusSentence(input);
  const financialItems = buildFinancialItems(input);
  const financialNote =
    input.financialImpact?.note ??
    (input.audience === "participant" && input.financialImpact?.participantRefundLabel
      ? "Die Rückerstattung erfolgt automatisch über die ursprünglich verwendete Zahlungsart."
      : null);
  const providerItems = buildProviderItems(input);
  const subject = input.subject?.trim() || `${statusLabel}: ${input.offer.offerTitle}`;
  const greeting = input.greetingName?.trim() ? `<p style="margin:0 0 16px;">Hallo ${escapeHtml(input.greetingName.trim())},</p>` : "";
  const textGreeting = input.greetingName?.trim() ? `Hallo ${input.greetingName.trim()},` : null;

  const financialHtml = hasFinancialBlock(input)
    ? renderInfoBlockHtml("Finanzielle Auswirkungen", financialItems, financialNote)
    : "";
  const financialText = hasFinancialBlock(input)
    ? renderInfoBlockText("Finanzielle Auswirkungen", financialItems, financialNote)
    : null;
  const providerHtml = renderInfoBlockHtml("Teilnahme", providerItems);
  const providerText = renderInfoBlockText("Teilnahme", providerItems);

  return {
    to: input.to,
    subject,
    replyTo: input.replyTo,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;max-width:640px;">
        <h2 style="margin:0 0 18px;font-size:26px;line-height:1.25;">${escapeHtml(statusLabel)}</h2>
        ${greeting}
        <div style="margin:0 0 24px;padding:18px 20px;border:1px solid #ddd6fe;border-radius:14px;background:#f5f3ff;">
          <p style="margin:0;font-size:17px;line-height:1.55;color:#111827;">${escapeHtml(statusSentence)}</p>
        </div>
        ${financialHtml}
        ${providerHtml}
        ${renderOfferSummaryEmailHtml(input.offer)}
        <p style="margin:24px 0 0;color:#4b5563;">Wenn du Fragen hast, antworte direkt auf diese E-Mail.</p>
        ${renderFooterHtml()}
      </div>
    `,
    text: [
      statusLabel,
      textGreeting,
      statusSentence,
      financialText ? "" : null,
      financialText,
      providerText ? "" : null,
      providerText,
      "",
      renderOfferSummaryEmailText(input.offer),
      "",
      "Wenn du Fragen hast, antworte direkt auf diese E-Mail.",
      "",
      renderFooterText(),
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

export async function sendStatusChangeEmail(input: StatusChangeEmailInput) {
  const email = prepareStatusChangeEmail(input);
  return sendResendEmail({
    to: email.to,
    subject: email.subject,
    html: email.html,
    text: email.text,
    replyTo: email.replyTo ?? undefined,
  });
}
