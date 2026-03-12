import { getResend } from "@/lib/resend";

export type TrialReservationEmailData = {
  reservationId: string;
  courseTitle: string;
  teacherName: string | null;
  teacherEmail: string | null;
  customerName: string;
  customerEmail: string;
  location: string | null;
  trialStartsAt: string;
  trialEndsAt: string;
  cancelUrl: string;
};

function formatDateTimeRange(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const date = start.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const startTime = start.toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const endTime = end.toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${date} | ${startTime}-${endTime}`;
}

export function prepareCustomerTrialReservationConfirmation(data: TrialReservationEmailData) {
  const teacherLine = data.teacherName ? `<p><b>Dozent*in:</b> ${data.teacherName}</p>` : "";
  const locationLine = data.location ? `<p><b>Ort:</b> ${data.location}</p>` : "";
  const dateLine = `<p><b>Termin:</b> ${formatDateTimeRange(data.trialStartsAt, data.trialEndsAt)}</p>`;

  return {
    to: data.customerEmail,
    subject: `Deine Probestunde ist reserviert: ${data.courseTitle}`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5;">
        <h2>Deine Probestunden-Reservierung war erfolgreich</h2>
        <p>Hallo ${data.customerName},</p>
        <p>vielen Dank für deine Anfrage. Deine Probestunde für <b>${data.courseTitle}</b> wurde erfolgreich reserviert.</p>
        ${teacherLine}
        ${locationLine}
        ${dateLine}
        <p>Wenn du den Termin doch nicht wahrnehmen kannst, sage bitte möglichst frühzeitig ab, damit der Platz wieder frei wird.</p>
        <p>Über diesen Link kannst du deine Reservierung stornieren:</p>
        <p><a href="${data.cancelUrl}">${data.cancelUrl}</a></p>
        <p>Wir freuen uns auf dich.</p>
        <p>Herzliche Grüße<br />SKULT</p>
      </div>
    `,
    text: [
      `Deine Probestunden-Reservierung war erfolgreich: ${data.courseTitle}`,
      `Hallo ${data.customerName},`,
      "deine Probestunde wurde erfolgreich reserviert.",
      data.teacherName ? `Dozent*in: ${data.teacherName}` : null,
      data.location ? `Ort: ${data.location}` : null,
      `Termin: ${formatDateTimeRange(data.trialStartsAt, data.trialEndsAt)}`,
      `Falls du nicht teilnehmen kannst, storniere bitte rechtzeitig: ${data.cancelUrl}`,
      "Wir freuen uns auf dich.",
      "Herzliche Grüße",
      "SKULT",
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

export function prepareCustomerTrialReservationReminder(data: TrialReservationEmailData) {
  const teacherLine = data.teacherName ? `<p><b>Dozent*in:</b> ${data.teacherName}</p>` : "";
  const locationLine = data.location ? `<p><b>Ort:</b> ${data.location}</p>` : "";
  const dateLine = `<p><b>Termin:</b> ${formatDateTimeRange(data.trialStartsAt, data.trialEndsAt)}</p>`;

  return {
    to: data.customerEmail,
    subject: "Erinnerung an deine Probestunde morgen",
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5;">
        <h2>Erinnerung an deine Probestunde morgen</h2>
        <p>Hallo ${data.customerName},</p>
        <p>morgen ist deine reservierte Probestunde für <b>${data.courseTitle}</b>.</p>
        ${teacherLine}
        ${locationLine}
        ${dateLine}
        <p>Falls du den Termin doch nicht wahrnehmen kannst, storniere bitte rechtzeitig über diesen Link:</p>
        <p><a href="${data.cancelUrl}">${data.cancelUrl}</a></p>
        <p>Wir wünschen dir viel Freude bei deiner Probestunde.</p>
        <p>Herzliche Grüße<br />SKULT</p>
      </div>
    `,
    text: [
      "Erinnerung an deine Probestunde morgen",
      `Hallo ${data.customerName},`,
      `morgen ist deine reservierte Probestunde für ${data.courseTitle}.`,
      data.teacherName ? `Dozent*in: ${data.teacherName}` : null,
      data.location ? `Ort: ${data.location}` : null,
      `Termin: ${formatDateTimeRange(data.trialStartsAt, data.trialEndsAt)}`,
      `Falls du nicht teilnehmen kannst, storniere bitte rechtzeitig: ${data.cancelUrl}`,
      "Wir wünschen dir viel Freude bei deiner Probestunde.",
      "Herzliche Grüße",
      "SKULT",
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

export function prepareTeacherTrialReservationNotification(data: TrialReservationEmailData) {
  const locationLine = data.location ? `<p><b>Ort:</b> ${data.location}</p>` : "";
  const dateLine = `<p><b>Termin:</b> ${formatDateTimeRange(data.trialStartsAt, data.trialEndsAt)}</p>`;

  return {
    to: data.teacherEmail,
    subject: `Neue Probestunden-Reservierung: ${data.courseTitle}`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5;">
        <h2>Neue Probestunden-Reservierung</h2>
        <p>Für deinen Kurs <b>${data.courseTitle}</b> wurde eine neue Probestunde reserviert.</p>
        <p><b>Name:</b> ${data.customerName}</p>
        <p><b>E-Mail:</b> ${data.customerEmail}</p>
        ${locationLine}
        ${dateLine}
        <p>Eine erfolgreiche Probestunde kann später in eine reguläre Anmeldung übergehen.</p>
      </div>
    `,
    text: [
      `Neue Probestunden-Reservierung für ${data.courseTitle}`,
      `Name: ${data.customerName}`,
      `E-Mail: ${data.customerEmail}`,
      data.location ? `Ort: ${data.location}` : null,
      `Termin: ${formatDateTimeRange(data.trialStartsAt, data.trialEndsAt)}`,
      "Hinweis: Diese Probestunde kann später in eine reguläre Anmeldung übergehen.",
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

export function prepareTeacherTrialReservationCancellation(data: TrialReservationEmailData) {
  const locationLine = data.location ? `<p><b>Ort:</b> ${data.location}</p>` : "";
  const dateLine = `<p><b>Stornierter Termin:</b> ${formatDateTimeRange(data.trialStartsAt, data.trialEndsAt)}</p>`;

  return {
    to: data.teacherEmail,
    subject: `Stornierte Probestunden-Reservierung: ${data.courseTitle}`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5;">
        <h2>Probestunden-Reservierung wurde storniert</h2>
        <p>Eine Probestunden-Reservierung für deinen Kurs <b>${data.courseTitle}</b> wurde storniert.</p>
        <p><b>Name:</b> ${data.customerName}</p>
        <p><b>E-Mail:</b> ${data.customerEmail}</p>
        ${locationLine}
        ${dateLine}
      </div>
    `,
    text: [
      `Eine Probestunden-Reservierung für ${data.courseTitle} wurde storniert.`,
      `Name: ${data.customerName}`,
      `E-Mail: ${data.customerEmail}`,
      data.location ? `Ort: ${data.location}` : null,
      `Stornierter Termin: ${formatDateTimeRange(data.trialStartsAt, data.trialEndsAt)}`,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

export async function sendTrialReservationConfirmationEmail(data: TrialReservationEmailData) {
  const resend = getResend();
  const email = prepareCustomerTrialReservationConfirmation(data);
  return resend.emails.send({
    from: "onboarding@resend.dev",
    to: email.to,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });
}

export async function sendTrialReservationReminderEmail(data: TrialReservationEmailData) {
  const resend = getResend();
  const email = prepareCustomerTrialReservationReminder(data);
  return resend.emails.send({
    from: "onboarding@resend.dev",
    to: email.to,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });
}

export async function sendTeacherTrialReservationNotificationEmail(data: TrialReservationEmailData) {
  if (!data.teacherEmail) {
    console.log("[trial-reservation-email] missing teacher email", {
      reservationId: data.reservationId,
      courseTitle: data.courseTitle,
    });
    return null;
  }

  const resend = getResend();
  const email = prepareTeacherTrialReservationNotification(data);
  return resend.emails.send({
    from: "onboarding@resend.dev",
    to: email.to,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });
}

export async function sendTeacherTrialReservationCancellationEmail(data: TrialReservationEmailData) {
  if (!data.teacherEmail) {
    console.log("[trial-reservation-email] missing teacher email", {
      reservationId: data.reservationId,
      courseTitle: data.courseTitle,
    });
    return null;
  }

  const resend = getResend();
  const email = prepareTeacherTrialReservationCancellation(data);
  return resend.emails.send({
    from: "onboarding@resend.dev",
    to: email.to,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });
}
