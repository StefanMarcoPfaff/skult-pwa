import { getResend } from "@/lib/resend";
import { shouldShowStudioLabel } from "@/lib/provider-profiles";
import { buildTicketCheckInUrl, buildTicketQrCodeDataUrl } from "@/lib/ticket-qr";

/*
 * MVP verification checklist:
 * 1. Complete a paid workshop booking.
 * 2. Confirm exactly one public.tickets row exists for the booking.
 * 3. Confirm the customer HTML email contains an embedded QR image.
 * 4. Open /dashboard/check-in?token=<qr_token> and check in once.
 */

export type WorkshopBookingEmailData = {
  bookingId: string;
  workshopTitle: string;
  providerType?: "independent_teacher" | "studio_provider" | null;
  providerName: string | null;
  teacherName: string | null;
  teacherEmail: string | null;
  senderDisplayName?: string | null;
  senderImageUrl?: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone?: string | null;
  location: string | null;
  locationDetails: string | null;
  sessionLines: string[];
  stornoPolicyLabel: string | null;
  priceLabel: string | null;
  qrToken: string;
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
  return [
    ...(shouldShowStudioLabel(input.providerType)
      ? [{ label: "Anbieter / Studio", value: input.providerName }]
      : []),
    { label: "Dozent", value: input.teacherName },
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
      <tr>
        <td style="padding: 6px 0; vertical-align: top; color: #5b6470; width: 170px;"><b>${item.label}</b></td>
        <td style="padding: 6px 0; color: #111827;">${item.value}</td>
      </tr>
    `
  );

  if (rows.length === 0) return "";

  return `
    <div style="margin: 24px 0; padding: 18px 20px; border: 1px solid #e5e7eb; border-radius: 14px; background: #f8fafc;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse;">
        ${rows.join("")}
      </table>
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

function isHttpUrl(value: string | null | undefined): value is string {
  return Boolean(value && /^https?:\/\//i.test(value));
}

function renderFooterHtml(branding?: FooterBranding) {
  const senderName = branding?.senderName?.trim() || "SKULT";
  const imageHtml = isHttpUrl(branding?.senderImageUrl)
    ? `
      <div style="margin: 18px 0 12px; text-align: center;">
        <img
          src="${branding?.senderImageUrl}"
          alt="${senderName}"
          style="max-height: 120px; width: auto; max-width: 220px; display: inline-block; border-radius: 12px;"
        />
      </div>
    `
    : "";

  return `
    <div style="margin: 24px 0 0; text-align: center;">
      <p style="margin: 0;">Herzliche Grüße</p>
      ${imageHtml}
      <p style="margin: 0; font-weight: 600;">${senderName}</p>
    </div>
  `;
}

function renderFooterText(branding?: FooterBranding) {
  return ["Herzliche Grüße", branding?.senderName?.trim() || "SKULT"].join("\n");
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

function createHtmlEmail(input: {
  title: string;
  greeting?: string;
  intro: string;
  infoItems?: InfoItem[];
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

  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827; max-width: 640px;">
      <h2 style="margin: 0 0 18px; font-size: 26px; line-height: 1.25;">${input.title}</h2>
      ${greeting}
      <p style="margin: 0;">${input.intro}</p>
      ${infoBlock}
      ${nextSteps}
      ${renderActionsHtml(input.actions ?? [])}
      ${input.support ?? `<p style="margin: 24px 0 0; color: #4b5563;">Wenn du Fragen hast, helfen wir dir gerne weiter.</p>`}
      ${renderFooterHtml(input.footer)}
    </div>
  `;
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
  const qrUrl = buildTicketCheckInUrl(data.qrToken);
  const qrDataUrl = await buildTicketQrCodeDataUrl(data.qrToken);

  return {
    to: data.customerEmail,
    subject: `Deine Workshop-Buchung war erfolgreich 🎉 ${data.workshopTitle}`,
    html:
      createHtmlEmail({
        title: "Deine Workshop-Buchung war erfolgreich 🎉",
        greeting: data.customerName,
        intro: `Deine Buchung für <b>${data.workshopTitle}</b> ist erfolgreich abgeschlossen. Deine Zahlung wurde bestätigt.`,
        infoItems: [
          { label: "Workshop", value: data.workshopTitle },
          ...buildProviderInfoItems(data),
          { label: "Preis", value: data.priceLabel },
          { label: "Stornierungsbedingungen", value: data.stornoPolicyLabel },
          { label: "Ort", value: data.location },
          { label: "Weitere Infos", value: data.locationDetails },
          {
            label: "Datum / Zeiten",
            value: data.sessionLines.length > 0 ? data.sessionLines.join("<br />") : "Termin folgt",
          },
        ],
        nextSteps: [
          "Dein Platz ist fest für dich reserviert.",
          "Bitte zeige dein Ticket beim Einlass vor.",
        ],
        actions: [
          { label: "Ticket ansehen", href: qrUrl },
          { label: "Zu meinen Kursen", href: buildAbsoluteUrl("/courses") },
        ],
        support: `
          <div style="margin: 24px 0 0;">
            <p style="margin: 0 0 10px;"><b>Dein Ticket</b></p>
            <p style="margin: 0 0 14px;">Bitte zeige dieses Ticket beim Einlass vor.</p>
            <p style="margin: 0 0 14px;"><img src="${qrDataUrl}" alt="QR-Ticket für den Workshop" width="180" height="180" /></p>
            <p style="margin: 0;"><a href="${qrUrl}">${qrUrl}</a></p>
          </div>
          <p style="margin: 18px 0 0; color: #4b5563;">Wenn du Fragen hast, helfen wir dir gerne weiter.</p>
        `,
        footer: buildFooterBranding(data),
      }),
    text: createTextEmail({
      title: "Deine Workshop-Buchung war erfolgreich 🎉",
      greeting: data.customerName,
      intro: `Deine Buchung für ${data.workshopTitle} ist erfolgreich abgeschlossen. Deine Zahlung wurde bestätigt.`,
      infoItems: [
        { label: "Workshop", value: data.workshopTitle },
        ...buildProviderInfoItems(data),
        { label: "Preis", value: data.priceLabel },
        { label: "Stornierungsbedingungen", value: data.stornoPolicyLabel },
        { label: "Ort", value: data.location },
        { label: "Weitere Infos", value: data.locationDetails },
        { label: "Datum / Zeiten", value: data.sessionLines.length > 0 ? data.sessionLines.join(" | ") : "Termin folgt" },
      ],
      nextSteps: [
        "Dein Platz ist fest für dich reserviert.",
        "Bitte zeige dein Ticket beim Einlass vor.",
      ],
      actions: [
        { label: "Ticket ansehen", href: qrUrl },
        { label: "Zu meinen Kursen", href: buildAbsoluteUrl("/courses") },
      ],
      support: `Ticket-Link: ${qrUrl}`,
      footer: buildFooterBranding(data),
    }),
  };
}

export function prepareWorkshopTeacherBookingNotification(data: WorkshopBookingEmailData) {
  const footerHtml = renderFooterHtml(buildFooterBranding(data));
  const footerText = renderFooterText(buildFooterBranding(data));

  return {
    to: data.teacherEmail ?? "",
    subject: `Neue Workshop-Anmeldung: ${data.workshopTitle}`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5;">
        <h2>Neue Workshop-Anmeldung</h2>
        <p><b>${data.customerName}</b> hat den Workshop <b>${data.workshopTitle}</b> gebucht und bezahlt.</p>
        <p><b>E-Mail:</b> ${data.customerEmail}</p>
        ${data.customerPhone ? `<p><b>Telefon:</b> ${data.customerPhone}</p>` : ""}
        ${data.providerName ? `<p><b>Anbieter:</b> ${data.providerName}</p>` : ""}
        ${data.location ? `<p><b>Ort:</b> ${data.location}</p>` : ""}
        ${data.locationDetails ? `<p><b>Ort / Zusatzinfo:</b> ${data.locationDetails}</p>` : ""}
        ${data.priceLabel ? `<p><b>Preis:</b> ${data.priceLabel}</p>` : ""}
        ${
          data.sessionLines.length > 0
            ? `<div><p><b>Termine:</b></p><ul>${data.sessionLines.map((line) => `<li>${line}</li>`).join("")}</ul></div>`
            : "<p><b>Termin:</b> Termin folgt</p>"
        }
        ${footerHtml}
      </div>
    `,
    text: [
      `Neue Workshop-Anmeldung: ${data.workshopTitle}`,
      `${data.customerName} hat den Workshop gebucht und bezahlt.`,
      `E-Mail: ${data.customerEmail}`,
      data.customerPhone ? `Telefon: ${data.customerPhone}` : null,
      data.providerName ? `Anbieter: ${data.providerName}` : null,
      data.location ? `Ort: ${data.location}` : null,
      data.locationDetails ? `Ort / Zusatzinfo: ${data.locationDetails}` : null,
      data.priceLabel ? `Preis: ${data.priceLabel}` : null,
      data.sessionLines.length > 0 ? "Termine:" : "Termin: Termin folgt",
      ...data.sessionLines,
      "",
      footerText,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

export async function sendWorkshopCustomerBookingConfirmationEmail(data: WorkshopBookingEmailData) {
  const resend = getResend();
  const email = await prepareWorkshopCustomerBookingConfirmation(data);
  return resend.emails.send({
    from: "onboarding@resend.dev",
    to: email.to,
    subject: email.subject,
    html: email.html,
    text: email.text,
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

  const resend = getResend();
  const email = prepareWorkshopTeacherBookingNotification(data);
  return resend.emails.send({
    from: "onboarding@resend.dev",
    to: email.to,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });
}

export async function sendWorkshopBookingNotificationEmail(data: WorkshopBookingEmailData) {
  return sendWorkshopTeacherBookingNotificationEmail(data);
}
