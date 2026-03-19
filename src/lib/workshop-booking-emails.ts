import { getResend } from "@/lib/resend";
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
  providerName: string | null;
  teacherName: string | null;
  teacherEmail: string | null;
  customerName: string;
  customerEmail: string;
  location: string | null;
  locationDetails: string | null;
  sessionLines: string[];
  stornoPolicyLabel: string | null;
  priceLabel: string | null;
  qrToken: string;
};

function renderSessionListHtml(sessionLines: string[]): string {
  if (sessionLines.length === 0) {
    return "<p><b>Termin:</b> Termin folgt</p>";
  }

  return `
    <div>
      <p><b>Termine:</b></p>
      <ul>
        ${sessionLines.map((line) => `<li>${line}</li>`).join("")}
      </ul>
    </div>
  `;
}

export async function prepareWorkshopCustomerBookingConfirmation(data: WorkshopBookingEmailData) {
  const locationLine = data.location ? `<p><b>Ort:</b> ${data.location}</p>` : "";
  const locationDetailsLine = data.locationDetails
    ? `<p><b>Ort / Zusatzinfo:</b> ${data.locationDetails}</p>`
    : "";
  const providerLine = data.providerName ? `<p><b>Anbieter:</b> ${data.providerName}</p>` : "";
  const teacherLine = data.teacherName ? `<p><b>Dozent*in:</b> ${data.teacherName}</p>` : "";
  const stornoLine = data.stornoPolicyLabel
    ? `<p><b>Storno-Regel:</b> ${data.stornoPolicyLabel}</p>`
    : "";
  const priceLine = data.priceLabel ? `<p><b>Preis:</b> ${data.priceLabel}</p>` : "";
  const qrUrl = buildTicketCheckInUrl(data.qrToken);
  const qrDataUrl = await buildTicketQrCodeDataUrl(data.qrToken);

  return {
    to: data.customerEmail,
    subject: `Workshop gebucht: ${data.workshopTitle}`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5;">
        <h2>Deine Workshop-Buchung ist bestaetigt</h2>
        <p>Hallo ${data.customerName},</p>
        <p>deine Zahlung fuer <b>${data.workshopTitle}</b> ist eingegangen.</p>
        ${providerLine}
        ${teacherLine}
        ${priceLine}
        ${locationLine}
        ${locationDetailsLine}
        ${renderSessionListHtml(data.sessionLines)}
        ${stornoLine}
        <p>Bitte zeige dieses QR-Ticket beim Einlass vor. Es wird vor Ort gescannt.</p>
        <p><img src="${qrDataUrl}" alt="QR-Ticket fuer den Workshop" width="180" height="180" /></p>
        <p><a href="${qrUrl}">${qrUrl}</a></p>
        <p>Herzliche Gruesse<br />SKULT</p>
      </div>
    `,
    text: [
      `Workshop gebucht: ${data.workshopTitle}`,
      `Hallo ${data.customerName},`,
      `deine Zahlung fuer ${data.workshopTitle} ist eingegangen.`,
      data.providerName ? `Anbieter: ${data.providerName}` : null,
      data.teacherName ? `Dozent*in: ${data.teacherName}` : null,
      data.priceLabel ? `Preis: ${data.priceLabel}` : null,
      data.location ? `Ort: ${data.location}` : null,
      data.locationDetails ? `Ort / Zusatzinfo: ${data.locationDetails}` : null,
      data.sessionLines.length > 0 ? "Termine:" : "Termin: Termin folgt",
      ...data.sessionLines,
      data.stornoPolicyLabel ? `Storno-Regel: ${data.stornoPolicyLabel}` : null,
      "Bitte zeige dieses QR-Ticket beim Einlass vor. Es wird vor Ort gescannt.",
      `Check-in-Link: ${qrUrl}`,
      "Herzliche Gruesse",
      "SKULT",
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

export function prepareWorkshopTeacherBookingNotification(data: WorkshopBookingEmailData) {
  return {
    to: data.teacherEmail ?? "",
    subject: `Neue Workshop-Buchung: ${data.workshopTitle}`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5;">
        <h2>Neue bezahlte Workshop-Buchung</h2>
        <p><b>${data.customerName}</b> hat den Workshop <b>${data.workshopTitle}</b> gebucht und bezahlt.</p>
        <p><b>E-Mail:</b> ${data.customerEmail}</p>
        ${data.providerName ? `<p><b>Anbieter:</b> ${data.providerName}</p>` : ""}
        ${data.location ? `<p><b>Ort:</b> ${data.location}</p>` : ""}
        ${data.locationDetails ? `<p><b>Ort / Zusatzinfo:</b> ${data.locationDetails}</p>` : ""}
        ${data.priceLabel ? `<p><b>Preis:</b> ${data.priceLabel}</p>` : ""}
        ${
          data.sessionLines.length > 0
            ? `<div><p><b>Termine:</b></p><ul>${data.sessionLines.map((line) => `<li>${line}</li>`).join("")}</ul></div>`
            : "<p><b>Termin:</b> Termin folgt</p>"
        }
      </div>
    `,
    text: [
      `Neue Workshop-Buchung: ${data.workshopTitle}`,
      `${data.customerName} hat den Workshop gebucht und bezahlt.`,
      `E-Mail: ${data.customerEmail}`,
      data.providerName ? `Anbieter: ${data.providerName}` : null,
      data.location ? `Ort: ${data.location}` : null,
      data.locationDetails ? `Ort / Zusatzinfo: ${data.locationDetails}` : null,
      data.priceLabel ? `Preis: ${data.priceLabel}` : null,
      data.sessionLines.length > 0 ? "Termine:" : "Termin: Termin folgt",
      ...data.sessionLines,
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
