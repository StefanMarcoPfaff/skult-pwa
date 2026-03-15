import { getResend } from "@/lib/resend";
import { buildTicketCheckInUrl, buildTicketQrCodeDataUrl } from "@/lib/ticket-qr";

export type WorkshopBookingEmailData = {
  bookingId: string;
  workshopTitle: string;
  teacherName: string | null;
  teacherEmail: string | null;
  customerName: string;
  customerEmail: string;
  location: string | null;
  startsAt: string | null;
  endsAt: string | null;
  qrToken: string;
};

function formatDateTimeRange(startsAt: string | null, endsAt: string | null): string {
  if (!startsAt) return "Termin folgt";

  const start = new Date(startsAt);
  const date = start.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const startTime = start.toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (!endsAt) return `${date} | ${startTime}`;

  const end = new Date(endsAt);
  const endTime = end.toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return `${date} | ${startTime}-${endTime}`;
}

export function prepareWorkshopCustomerBookingConfirmation(data: WorkshopBookingEmailData) {
  const locationLine = data.location ? `<p><b>Ort:</b> ${data.location}</p>` : "";
  const teacherLine = data.teacherName ? `<p><b>Dozent*in:</b> ${data.teacherName}</p>` : "";
  const qrUrl = buildTicketCheckInUrl(data.qrToken);
  const qrDataUrl = buildTicketQrCodeDataUrl(data.qrToken);

  return {
    to: data.customerEmail,
    subject: `Workshop gebucht: ${data.workshopTitle}`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5;">
        <h2>Deine Workshop-Buchung ist bestaetigt</h2>
        <p>Hallo ${data.customerName},</p>
        <p>deine Zahlung fuer <b>${data.workshopTitle}</b> ist eingegangen.</p>
        ${teacherLine}
        ${locationLine}
        <p><b>Termin:</b> ${formatDateTimeRange(data.startsAt, data.endsAt)}</p>
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
      data.teacherName ? `Dozent*in: ${data.teacherName}` : null,
      data.location ? `Ort: ${data.location}` : null,
      `Termin: ${formatDateTimeRange(data.startsAt, data.endsAt)}`,
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
        ${data.location ? `<p><b>Ort:</b> ${data.location}</p>` : ""}
        <p><b>Termin:</b> ${formatDateTimeRange(data.startsAt, data.endsAt)}</p>
      </div>
    `,
    text: [
      `Neue Workshop-Buchung: ${data.workshopTitle}`,
      `${data.customerName} hat den Workshop gebucht und bezahlt.`,
      `E-Mail: ${data.customerEmail}`,
      data.location ? `Ort: ${data.location}` : null,
      `Termin: ${formatDateTimeRange(data.startsAt, data.endsAt)}`,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

export async function sendWorkshopCustomerBookingConfirmationEmail(data: WorkshopBookingEmailData) {
  const resend = getResend();
  const email = prepareWorkshopCustomerBookingConfirmation(data);
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
