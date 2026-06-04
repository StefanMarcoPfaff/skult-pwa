import type { Attachment } from "resend";
import { shouldShowStudioLabel } from "@/lib/provider-profiles";
import { buildBookingCalendarUrl } from "@/lib/calendar";
import { buildTicketQrCodeDataUrl, buildTicketViewUrl, buildTicketWalletUrl } from "@/lib/ticket-qr";
import { buildOfferViewModel, renderOfferSummaryEmailHtml } from "@/lib/offers/offer-view-model";
import {
  renderOfferEmailFooterHtml,
  renderOfferEmailFooterText,
  renderOfferEmailLayout,
  sendOfferRelatedEmail,
} from "@/lib/offer-email-layout";
import { resolveWorkshopProviderDisplay } from "@/lib/workshop-offer-display";
import { sendStatusChangeEmail } from "@/lib/status-change-emails";

export type WorkshopBookingEmailData = {
  bookingId: string;
  workshopTitle: string;
  providerType?: "independent_teacher" | "studio_provider" | null;
  providerName: string | null;
  teacherName: string | null;
  teacherEmail: string | null;
  senderDisplayName?: string | null;
  senderImageUrl?: string | null;
  providerLogoUrl?: string | null;
  offerImageUrl?: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone?: string | null;
  location: string | null;
  locationDetails: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  sessionLines: string[];
  stornoPolicyLabel: string | null;
  priceLabel: string | null;
  paymentStatus?: "paid" | "free" | null;
  qrToken: string;
  attachments?: Attachment[];
};

type EmailAction = {
  label: string;
  href: string;
};

type InfoItem = {
  label: string;
  value: string | null | undefined;
};

type FooterBranding = {
  senderName?: string | null;
  senderImageUrl?: string | null;
};

function buildProviderInfoItems(input: {
  providerType?: "independent_teacher" | "studio_provider" | null;
  providerName: string | null;
  teacherName: string | null;
}): InfoItem[] {
  const display = resolveWorkshopProviderDisplay({
    providerType: input.providerType,
    providerName: input.providerName,
    instructorName: input.teacherName,
  });

  return [
    { label: "Organisation / Anbietende", value: display.organizationLabel },
    { label: "Leitung", value: display.instructorLabel },
  ];
}

function getSiteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
}

function buildAbsoluteUrl(path: string): string {
  return new URL(path, getSiteUrl()).toString();
}

function renderInfoBlockHtml(items: InfoItem[]): string {
  const rows = items.filter((item) => item.value).map(
    (item) => `
      <div style="margin: 0 0 14px;">
        <div style="font-size: 12px; line-height: 1.35; color: #5b6470; font-weight: 700;">${item.label}</div>
        <div style="margin-top: 3px; color: #111827;">${item.value}</div>
      </div>
    `
  );

  if (rows.length === 0) return "";

  return `
    <div style="margin: 24px 0; padding: 18px 20px; border: 1px solid #e5e7eb; border-radius: 14px; background: #f8fafc;">
      ${rows.join("")}
    </div>
  `;
}

function renderActionsHtml(actions: EmailAction[]): string {
  if (actions.length === 0) return "";

  return `
    <div style="margin: 24px 0 8px;">
      ${actions
        .map(
          (action) => `
            <p style="margin: 0 0 12px;">
              <a href="${action.href}" style="display: inline-block; padding: 12px 18px; border-radius: 10px; background: #111827; color: #ffffff; text-decoration: none; font-weight: 600;">
                ${action.label}
              </a>
            </p>
          `
        )
        .join("")}
    </div>
  `;
}

function renderFooterText(branding?: FooterBranding) {
  return renderOfferEmailFooterText({
    senderName: branding?.senderName?.trim() || "SKULT",
    senderImageUrl: branding?.senderImageUrl,
  });
}

function buildFooterBranding(data: WorkshopBookingEmailData): FooterBranding {
  return {
    senderName:
      data.senderDisplayName ??
      (shouldShowStudioLabel(data.providerType) ? data.providerName : null) ??
      data.teacherName ??
      "SKULT",
    senderImageUrl: data.senderImageUrl,
  };
}

function buildEmailOfferViewModel(data: WorkshopBookingEmailData) {
  const viewModel = buildOfferViewModel({
    course: {
      title: data.workshopTitle,
      kind: "workshop",
      location: data.location,
      location_details: data.locationDetails,
      instructor_name: data.teacherName,
      price_cents: data.paymentStatus === "free" ? 0 : null,
      offer_image_url: data.offerImageUrl ?? null,
    },
    providerProfile: {
      provider_type: data.providerType ?? null,
      organization_name: data.providerName,
      first_name: data.providerType === "studio_provider" ? null : data.providerName,
      last_name: null,
      photo_url: data.senderImageUrl ?? null,
      company_logo_url: data.providerLogoUrl ?? null,
      email: data.teacherEmail,
    },
    sessions: [{ starts_at: data.startsAt ?? null, ends_at: data.endsAt ?? null }],
    paymentStatus: data.paymentStatus,
    replyToEmail: data.teacherEmail,
  });
  return {
    ...viewModel,
    priceLabel: data.priceLabel ?? viewModel.priceLabel,
    cancellationLabel: data.stornoPolicyLabel,
    showCancellationTerms: Boolean(data.stornoPolicyLabel),
    sessions:
      data.sessionLines.length > 0
        ? data.sessionLines.map((line) => ({
            dateLabel: line,
            timeLabel: line,
            dateTimeLabel: line,
            startsAtBerlin: null,
            endsAtBerlin: null,
          }))
        : viewModel.sessions,
  };
}

function createHtmlEmail(input: {
  title: string;
  greeting?: string;
  intro: string;
  infoItems?: InfoItem[];
  offerSummaryHtml?: string;
  nextSteps?: string[];
  actions?: EmailAction[];
  support?: string;
  footer?: FooterBranding;
}) {
  const infoBlock = renderInfoBlockHtml(input.infoItems ?? []);
  const greeting = input.greeting ? `<p style="margin: 0 0 16px;">Hallo ${input.greeting},</p>` : "";
  const nextSteps =
    input.nextSteps && input.nextSteps.length > 0
      ? `
        <div style="margin: 24px 0 0;">
          <p style="margin: 0 0 10px;"><b>Was jetzt wichtig ist</b></p>
          <ul style="margin: 0; padding-left: 20px; color: #111827;">
            ${input.nextSteps.map((step) => `<li style="margin: 0 0 8px;">${step}</li>`).join("")}
          </ul>
        </div>
      `
      : "";

  return renderOfferEmailLayout({
    title: input.title,
    branding: input.footer ?? { senderName: "SKULT" },
    childrenHtml: `
      ${greeting}
      <p style="margin: 0;">${input.intro}</p>
      ${input.offerSummaryHtml ?? ""}
      ${infoBlock}
      ${nextSteps}
      ${renderActionsHtml(input.actions ?? [])}
      ${input.support ?? `<p style="margin: 24px 0 0; color: #4b5563;">Wenn du Fragen hast, helfen wir dir gerne weiter.</p>`}
    `,
  });
}

function createTextEmail(input: {
  title: string;
  greeting?: string;
  intro: string;
  infoItems?: InfoItem[];
  nextSteps?: string[];
  actions?: EmailAction[];
  support?: string;
  footer?: FooterBranding;
}) {
  const infoLines = (input.infoItems ?? [])
    .filter((item) => item.value)
    .map((item) => `${item.label}: ${item.value}`);
  const actionLines = (input.actions ?? []).map((action) => `${action.label}: ${action.href}`);

  return [
    input.title,
    input.greeting ? `Hallo ${input.greeting},` : null,
    input.intro,
    infoLines.length > 0 ? "" : null,
    infoLines.length > 0 ? "Wichtige Informationen" : null,
    ...infoLines,
    input.nextSteps && input.nextSteps.length > 0 ? "" : null,
    input.nextSteps && input.nextSteps.length > 0 ? "Was jetzt wichtig ist" : null,
    ...(input.nextSteps ?? []).map((step) => `- ${step}`),
    actionLines.length > 0 ? "" : null,
    ...actionLines,
    "",
    input.support ?? "Wenn du Fragen hast, helfen wir dir gerne weiter.",
    "",
    renderFooterText(input.footer),
  ]
    .filter(Boolean)
    .join("\n");
}

export async function prepareWorkshopCustomerBookingConfirmation(data: WorkshopBookingEmailData) {
  const ticketUrl = buildTicketViewUrl(data.qrToken);
  const walletUrl = buildTicketWalletUrl(data.qrToken);
  const qrDataUrl = await buildTicketQrCodeDataUrl(data.qrToken);
  const calendarUrl = buildBookingCalendarUrl(data.qrToken, "ticket");
  const isFreeBooking = data.paymentStatus === "free";
  const replyTo = data.teacherEmail?.trim() || null;
  const offerViewModel = buildEmailOfferViewModel(data);

  return {
    to: data.customerEmail,
    replyTo,
    subject: isFreeBooking
      ? `Dein Platz wurde reserviert: ${data.workshopTitle}`
      : `Deine Buchung war erfolgreich: ${data.workshopTitle}`,
    html:
      createHtmlEmail({
        title: isFreeBooking ? "Dein Platz wurde reserviert" : "Deine Buchung war erfolgreich",
        greeting: data.customerName,
        intro: isFreeBooking
          ? `dein Platz für <b>${data.workshopTitle}</b> wurde erfolgreich reserviert.`
          : `deine Buchung für <b>${data.workshopTitle}</b> ist erfolgreich abgeschlossen. Deine Zahlung wurde bestätigt.`,
        offerSummaryHtml: renderOfferSummaryEmailHtml(offerViewModel),
        nextSteps: [
          "Bitte zeige dein Ticket beim Einlass vor.",
        ],
        actions: [
          { label: "Ticket ansehen", href: ticketUrl },
          { label: "Zum Kalender hinzufügen", href: calendarUrl },
          { label: "Ins Wallet speichern", href: walletUrl },
          { label: "Zu den Angeboten", href: buildAbsoluteUrl("/courses") },
        ],
        support: `
          <div style="margin: 24px 0 0;">
            <p style="margin: 0 0 10px;"><b>Dein Ticket</b></p>
            <p style="margin: 0 0 14px;">Bitte zeige dieses Ticket beim Einlass vor.</p>
            <p style="margin: 0 0 14px;"><img src="${qrDataUrl}" alt="QR-Ticket für das Angebot" width="180" height="180" /></p>
          </div>
          <p style="margin: 18px 0 0; color: #4b5563;">Wenn du Fragen hast, helfen wir dir gerne weiter.</p>
        `,
        footer: buildFooterBranding(data),
      }),
    text: createTextEmail({
      title: isFreeBooking ? "Dein Platz wurde reserviert" : "Deine Buchung war erfolgreich",
      greeting: data.customerName,
      intro: isFreeBooking
        ? `dein Platz für ${data.workshopTitle} wurde erfolgreich reserviert.`
        : `deine Buchung für ${data.workshopTitle} ist erfolgreich abgeschlossen. Deine Zahlung wurde bestätigt.`,
      infoItems: [
        { label: "Angebot", value: data.workshopTitle },
        ...buildProviderInfoItems(data),
        { label: "Preis", value: data.priceLabel },
        { label: "Stornierungsbedingungen", value: data.stornoPolicyLabel },
        { label: "Ort", value: data.location },
        { label: "Weitere Infos", value: data.locationDetails },
        { label: "Datum / Zeiten", value: data.sessionLines.length > 0 ? data.sessionLines.join(" | ") : "Termin folgt" },
      ],
      nextSteps: [
        "Bitte zeige dein Ticket beim Einlass vor.",
      ],
      actions: [
        { label: "Ticket ansehen", href: ticketUrl },
        { label: "Zum Kalender hinzufügen", href: calendarUrl },
        { label: "Ins Wallet speichern", href: walletUrl },
        { label: "Zu den Angeboten", href: buildAbsoluteUrl("/courses") },
      ],
      support: `Ticket-Link: ${ticketUrl}`,
      footer: buildFooterBranding(data),
    }),
  };
}

export function prepareWorkshopTeacherBookingNotification(data: WorkshopBookingEmailData) {
  const footerBranding = buildFooterBranding(data);
  const footerHtml = renderOfferEmailFooterHtml(footerBranding);
  const footerText = renderOfferEmailFooterText(footerBranding);
  const calendarUrl = buildBookingCalendarUrl(data.qrToken, "ticket");
  const isFreeBooking = data.paymentStatus === "free";
  const offerSummaryHtml = renderOfferSummaryEmailHtml(buildEmailOfferViewModel(data));

  return {
    to: data.teacherEmail ?? "",
    subject: `Neue Reservierung: ${data.workshopTitle}`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5;">
        <h2>Neue Reservierung</h2>
        <p>Es gibt eine neue Reservierung für dein Angebot.</p>
        <p><b>${data.customerName}</b> hat ${isFreeBooking ? "kostenlos reserviert" : "gebucht und bezahlt"}.</p>
        <p><b>E-Mail:</b> ${data.customerEmail}</p>
        ${data.customerPhone ? `<p><b>Telefon:</b> ${data.customerPhone}</p>` : ""}
        ${offerSummaryHtml}
        <p><a href="${calendarUrl}">Zum Kalender hinzufügen</a></p>
        ${footerHtml}
      </div>
    `,
    text: [
      `Neue Reservierung: ${data.workshopTitle}`,
      `Es gibt eine neue Reservierung für dein Angebot.`,
      `${data.customerName} hat ${isFreeBooking ? "kostenlos reserviert" : "gebucht und bezahlt"}.`,
      `E-Mail: ${data.customerEmail}`,
      data.customerPhone ? `Telefon: ${data.customerPhone}` : null,
      data.location ? `Ort: ${data.location}` : null,
      data.locationDetails ? `Ort / Zusatzinfo: ${data.locationDetails}` : null,
      data.priceLabel ? `Preis: ${data.priceLabel}` : null,
      data.sessionLines.length > 0 ? "Termine:" : "Termin: Termin folgt",
      ...data.sessionLines,
      `Zum Kalender hinzufügen: ${calendarUrl}`,
      "",
      footerText,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

export async function sendWorkshopCustomerBookingConfirmationEmail(data: WorkshopBookingEmailData) {
  const email = await prepareWorkshopCustomerBookingConfirmation(data);
  return sendOfferRelatedEmail({
    to: email.to,
    subject: email.subject,
    html: email.html,
    text: email.text,
    replyTo: email.replyTo,
    offer: buildEmailOfferViewModel(data),
    branding: buildFooterBranding(data),
    attachments: data.attachments,
  });
}

export async function sendWorkshopTeacherBookingNotificationEmail(data: WorkshopBookingEmailData) {
  if (!data.teacherEmail) {
    console.log("[workshop-booking-email] missing teacher email", {
      bookingId: data.bookingId,
      workshopTitle: data.workshopTitle,
    });
    return null;
  }

  const email = prepareWorkshopTeacherBookingNotification(data);
  return sendOfferRelatedEmail({
    to: email.to,
    subject: email.subject,
    html: email.html,
    text: email.text,
    replyTo: data.teacherEmail,
    offer: buildEmailOfferViewModel(data),
    branding: buildFooterBranding(data),
  });
}

export async function sendWorkshopBookingNotificationEmail(data: WorkshopBookingEmailData) {
  return sendWorkshopTeacherBookingNotificationEmail(data);
}

export async function sendWorkshopCancellationEmail(input: {
  customerEmail: string;
  customerName: string;
  workshopTitle?: string | null;
  providerType?: "independent_teacher" | "studio_provider" | null;
  providerName?: string | null;
  teacherName?: string | null;
  teacherEmail?: string | null;
  senderImageUrl?: string | null;
  providerLogoUrl?: string | null;
  offerImageUrl?: string | null;
  location?: string | null;
  locationDetails?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  sessionLines?: string[];
  priceLabel?: string | null;
  paymentStatus?: "paid" | "free" | null;
  refundAmountLabel?: string | null;
  refunded?: boolean;
}) {
  const offerViewModel = buildEmailOfferViewModel({
    bookingId: "status-change",
    workshopTitle: input.workshopTitle ?? "Angebot",
    providerType: input.providerType ?? null,
    providerName: input.providerName ?? null,
    teacherName: input.teacherName ?? null,
    teacherEmail: input.teacherEmail ?? null,
    senderDisplayName: input.providerName ?? input.teacherName ?? null,
    senderImageUrl: input.senderImageUrl ?? null,
    providerLogoUrl: input.providerLogoUrl ?? null,
    offerImageUrl: input.offerImageUrl ?? null,
    customerName: input.customerName,
    customerEmail: input.customerEmail,
    location: input.location ?? null,
    locationDetails: input.locationDetails ?? null,
    startsAt: input.startsAt ?? null,
    endsAt: input.endsAt ?? null,
    sessionLines: input.sessionLines ?? [],
    stornoPolicyLabel: null,
    priceLabel: input.priceLabel ?? null,
    paymentStatus: input.paymentStatus ?? null,
    qrToken: "status-change",
  });

  return sendStatusChangeEmail({
    to: input.customerEmail,
    audience: "participant",
    status: input.refunded ? "refunded" : "cancelled",
    statusLabel: input.refunded ? "Storniert und erstattet" : "Storniert",
    greetingName: input.customerName,
    participantName: input.customerName,
    participantEmail: input.customerEmail,
    offer: offerViewModel,
    financialImpact:
      input.refunded && input.refundAmountLabel
        ? { participantRefundLabel: input.refundAmountLabel }
        : null,
    replyTo: input.teacherEmail,
  });
}
