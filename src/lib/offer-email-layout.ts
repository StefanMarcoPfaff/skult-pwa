import type { CreateEmailOptions } from "resend";
import type { OfferViewModel } from "@/lib/offers/offer-view-model";
import { sendResendEmail } from "@/lib/resend";

export type OfferEmailBranding = {
  senderName?: string | null;
  senderImageUrl?: string | null;
  replyToEmail?: string | null;
};

type OfferEmailLayoutInput = {
  title: string;
  preheader?: string | null;
  childrenHtml: string;
  branding: OfferEmailBranding;
};

type OfferEmailSendInput = Omit<Extract<CreateEmailOptions, { html: string }>, "from" | "replyTo"> & {
  offer?: OfferViewModel | null;
  branding?: OfferEmailBranding | null;
  replyTo?: string | null;
};

function isHttpUrl(value: string | null | undefined): value is string {
  return Boolean(value && /^https?:\/\//i.test(value));
}

export function escapeEmailHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function getOfferEmailSenderName(branding: OfferEmailBranding): string {
  return branding.senderName?.trim() || "Anbietende*r";
}

export function getOfferEmailReplyTo(input: {
  offer?: OfferViewModel | null;
  branding?: OfferEmailBranding | null;
  replyTo?: string | null;
  context?: string;
}): string {
  const replyTo =
    input.replyTo?.trim() ||
    input.branding?.replyToEmail?.trim() ||
    input.offer?.replyToEmail?.trim() ||
    null;

  if (replyTo) return replyTo;

  if (process.env.NODE_ENV !== "production") {
    console.warn("[offer-email] missing provider reply-to", { context: input.context ?? "unknown" });
  }

  return "hello@getreser.app";
}

export function buildOfferEmailBrandingFromOffer(offer: OfferViewModel): OfferEmailBranding {
  return {
    senderName: offer.organizationLabel ?? offer.providerDisplayName ?? offer.leaderName,
    senderImageUrl: offer.providerLogoUrl ?? offer.providerPhotoUrl,
    replyToEmail: offer.replyToEmail,
  };
}

export function renderOfferEmailFooterHtml(branding: OfferEmailBranding): string {
  const senderName = getOfferEmailSenderName(branding);
  const imageHtml = isHttpUrl(branding.senderImageUrl)
    ? `
      <div style="margin:18px 0 12px;text-align:center;">
        <img src="${escapeEmailHtml(branding.senderImageUrl)}" alt="${escapeEmailHtml(senderName)}" style="max-height:72px;max-width:180px;width:auto;border-radius:12px;display:inline-block;" />
      </div>
    `
    : "";

  return `
    <div style="margin:28px 0 0;text-align:center;color:#111827;">
      <p style="margin:0;">Herzliche Grüße</p>
      ${imageHtml}
      <p style="margin:0;font-weight:700;">${escapeEmailHtml(senderName)}</p>
      <p style="margin:8px 0 0;font-size:12px;line-height:1.5;color:#64748b;">Versendet über RESER</p>
    </div>
  `;
}

export function renderOfferEmailFooterText(branding: OfferEmailBranding): string {
  return ["Herzliche Grüße", getOfferEmailSenderName(branding), "Versendet über RESER"].join("\n");
}

export function renderOfferEmailLayout(input: OfferEmailLayoutInput): string {
  const preheader = input.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;color:transparent;">${escapeEmailHtml(input.preheader)}</div>`
    : "";

  return `
    ${preheader}
    <div style="margin:0;padding:24px;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#111827;">
      <div style="max-width:640px;margin:0 auto;line-height:1.6;">
        <h2 style="margin:0 0 18px;font-size:26px;line-height:1.25;font-weight:800;letter-spacing:0;color:#111827;">${escapeEmailHtml(input.title)}</h2>
        ${input.childrenHtml}
        ${renderOfferEmailFooterHtml(input.branding)}
      </div>
    </div>
  `;
}

export async function sendOfferRelatedEmail(input: OfferEmailSendInput) {
  const replyTo = getOfferEmailReplyTo({
    offer: input.offer,
    branding: input.branding,
    replyTo: input.replyTo,
    context: typeof input.subject === "string" ? input.subject : "offer-email",
  });
  const email = { ...input };
  delete email.offer;
  delete email.branding;

  return sendResendEmail({
    ...email,
    replyTo,
  });
}
