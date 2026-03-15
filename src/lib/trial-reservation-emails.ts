import { getResend } from "@/lib/resend";
import { buildTicketCheckInUrl, buildTicketQrCodeDataUrl } from "@/lib/ticket-qr";

/*
 * MVP verification checklist:
 * 1. Reserve a trial lesson.
 * 2. Confirm the customer HTML email contains an embedded QR image.
 * 3. Confirm the plain text email still includes the check-in URL.
 * 4. Open /dashboard/check-in?token=<qr_token>.
 * 5. Confirm the ticket status changes to checked_in.
 */

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
  qrToken?: string | null;
};

export type TrialRegistrationDecisionEmailData = {
  reservationId: string;
  courseTitle: string;
  customerName: string;
  customerEmail: string;
  registrationUrl?: string;
  registrationExpiresAt?: string;
};

export type TrialRegistrationExpiredEmailData = TrialRegistrationDecisionEmailData & {
  coursesOverviewUrl: string;
};

export type TeacherTrialDecisionReminderEmailData = {
  reservationId: string;
  courseTitle: string;
  teacherName: string | null;
  teacherEmail: string | null;
  customerName: string;
  customerEmail: string | null;
  trialStartsAt: string;
  trialEndsAt: string;
  dashboardUrl: string;
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

async function getQrLines(qrToken?: string | null) {
  if (!qrToken) {
    return {
      html: "",
      text: [] as string[],
    };
  }

  const checkInUrl = buildTicketCheckInUrl(qrToken);
  const qrDataUrl = await buildTicketQrCodeDataUrl(qrToken);
  return {
    html: `
      <p>Bitte bring dieses QR-Ticket mit. Es wird bei deiner Ankunft gescannt.</p>
      <p><img src="${qrDataUrl}" alt="QR-Ticket fuer deine Probestunde" width="180" height="180" /></p>
      <p><a href="${checkInUrl}">${checkInUrl}</a></p>
    `,
    text: [
      "Bitte bring dieses QR-Ticket mit. Es wird bei deiner Ankunft gescannt.",
      `Check-in-Link: ${checkInUrl}`,
    ],
  };
}

export async function prepareCustomerTrialReservationConfirmation(data: TrialReservationEmailData) {
  const teacherLine = data.teacherName ? `<p><b>Dozent*in:</b> ${data.teacherName}</p>` : "";
  const locationLine = data.location ? `<p><b>Ort:</b> ${data.location}</p>` : "";
  const dateLine = `<p><b>Termin:</b> ${formatDateTimeRange(data.trialStartsAt, data.trialEndsAt)}</p>`;
  const qrLines = await getQrLines(data.qrToken);

  return {
    to: data.customerEmail,
    subject: `Deine Probestunde ist reserviert: ${data.courseTitle}`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5;">
        <h2>Deine Probestunden-Reservierung war erfolgreich</h2>
        <p>Hallo ${data.customerName},</p>
        <p>vielen Dank fuer deine Anfrage. Deine Probestunde fuer <b>${data.courseTitle}</b> wurde erfolgreich reserviert.</p>
        ${teacherLine}
        ${locationLine}
        ${dateLine}
        ${qrLines.html}
        <p>Wenn du den Termin doch nicht wahrnehmen kannst, sage bitte moeglichst fruehzeitig ab, damit der Platz wieder frei wird.</p>
        <p>Ueber diesen Link kannst du deine Reservierung stornieren:</p>
        <p><a href="${data.cancelUrl}">${data.cancelUrl}</a></p>
        <p>Wir freuen uns auf dich.</p>
        <p>Herzliche Gruesse<br />SKULT</p>
      </div>
    `,
    text: [
      `Deine Probestunden-Reservierung war erfolgreich: ${data.courseTitle}`,
      `Hallo ${data.customerName},`,
      "deine Probestunde wurde erfolgreich reserviert.",
      data.teacherName ? `Dozent*in: ${data.teacherName}` : null,
      data.location ? `Ort: ${data.location}` : null,
      `Termin: ${formatDateTimeRange(data.trialStartsAt, data.trialEndsAt)}`,
      ...qrLines.text,
      `Falls du nicht teilnehmen kannst, storniere bitte rechtzeitig: ${data.cancelUrl}`,
      "Wir freuen uns auf dich.",
      "Herzliche Gruesse",
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
        <p>morgen ist deine reservierte Probestunde fuer <b>${data.courseTitle}</b>.</p>
        ${teacherLine}
        ${locationLine}
        ${dateLine}
        <p>Falls du den Termin doch nicht wahrnehmen kannst, storniere bitte rechtzeitig ueber diesen Link:</p>
        <p><a href="${data.cancelUrl}">${data.cancelUrl}</a></p>
        <p>Wir wuenschen dir viel Freude bei deiner Probestunde.</p>
        <p>Herzliche Gruesse<br />SKULT</p>
      </div>
    `,
    text: [
      "Erinnerung an deine Probestunde morgen",
      `Hallo ${data.customerName},`,
      `morgen ist deine reservierte Probestunde fuer ${data.courseTitle}.`,
      data.teacherName ? `Dozent*in: ${data.teacherName}` : null,
      data.location ? `Ort: ${data.location}` : null,
      `Termin: ${formatDateTimeRange(data.trialStartsAt, data.trialEndsAt)}`,
      `Falls du nicht teilnehmen kannst, storniere bitte rechtzeitig: ${data.cancelUrl}`,
      "Wir wuenschen dir viel Freude bei deiner Probestunde.",
      "Herzliche Gruesse",
      "SKULT",
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

export function prepareTeacherTrialReservationNotification(data: TrialReservationEmailData) {
  const locationLine = data.location ? `<p><b>Ort:</b> ${data.location}</p>` : "";
  const dateLine = `<p><b>Termin:</b> ${formatDateTimeRange(data.trialStartsAt, data.trialEndsAt)}</p>`;
  const teacherEmail = data.teacherEmail ?? "";

  return {
    to: teacherEmail,
    subject: `Neue Probestunden-Reservierung: ${data.courseTitle}`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5;">
        <h2>Neue Probestunden-Reservierung</h2>
        <p>Fuer deinen Kurs <b>${data.courseTitle}</b> wurde eine neue Probestunde reserviert.</p>
        <p><b>Name:</b> ${data.customerName}</p>
        <p><b>E-Mail:</b> ${data.customerEmail}</p>
        ${locationLine}
        ${dateLine}
        <p>Eine erfolgreiche Probestunde kann spaeter in eine regulaere Anmeldung uebergehen.</p>
      </div>
    `,
    text: [
      `Neue Probestunden-Reservierung fuer ${data.courseTitle}`,
      `Name: ${data.customerName}`,
      `E-Mail: ${data.customerEmail}`,
      data.location ? `Ort: ${data.location}` : null,
      `Termin: ${formatDateTimeRange(data.trialStartsAt, data.trialEndsAt)}`,
      "Hinweis: Diese Probestunde kann spaeter in eine regulaere Anmeldung uebergehen.",
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

export function prepareTeacherTrialReservationCancellation(data: TrialReservationEmailData) {
  const locationLine = data.location ? `<p><b>Ort:</b> ${data.location}</p>` : "";
  const dateLine = `<p><b>Stornierter Termin:</b> ${formatDateTimeRange(data.trialStartsAt, data.trialEndsAt)}</p>`;
  const teacherEmail = data.teacherEmail ?? "";

  return {
    to: teacherEmail,
    subject: `Stornierte Probestunden-Reservierung: ${data.courseTitle}`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5;">
        <h2>Probestunden-Reservierung wurde storniert</h2>
        <p>Eine Probestunden-Reservierung fuer deinen Kurs <b>${data.courseTitle}</b> wurde storniert.</p>
        <p><b>Name:</b> ${data.customerName}</p>
        <p><b>E-Mail:</b> ${data.customerEmail}</p>
        ${locationLine}
        ${dateLine}
      </div>
    `,
    text: [
      `Eine Probestunden-Reservierung fuer ${data.courseTitle} wurde storniert.`,
      `Name: ${data.customerName}`,
      `E-Mail: ${data.customerEmail}`,
      data.location ? `Ort: ${data.location}` : null,
      `Stornierter Termin: ${formatDateTimeRange(data.trialStartsAt, data.trialEndsAt)}`,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

function formatExpirationDateTime(value: string): string {
  const date = new Date(value);
  return date.toLocaleString("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function prepareTrialRegistrationApprovedEmail(data: TrialRegistrationDecisionEmailData) {
  const expiresAtLine = data.registrationExpiresAt
    ? `<p><b>Reserviert bis:</b> ${formatExpirationDateTime(data.registrationExpiresAt)}</p>`
    : "";

  return {
    to: data.customerEmail,
    subject: `Du kannst dich jetzt anmelden: ${data.courseTitle}`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5;">
        <h2>Du kannst dich jetzt verbindlich anmelden</h2>
        <p>Hallo ${data.customerName},</p>
        <p>nach der Probestunde kannst du dich jetzt fuer <b>${data.courseTitle}</b> verbindlich anmelden.</p>
        <p>Nutze dazu bitte diesen Link:</p>
        <p><a href="${data.registrationUrl}">${data.registrationUrl}</a></p>
        <p>Dein Platz ist fuer 96 Stunden fuer dich reserviert.</p>
        ${expiresAtLine}
        <p>Herzliche Gruesse<br />SKULT</p>
      </div>
    `,
    text: [
      `Du kannst dich jetzt verbindlich anmelden: ${data.courseTitle}`,
      `Hallo ${data.customerName},`,
      `du kannst dich jetzt fuer ${data.courseTitle} verbindlich anmelden.`,
      data.registrationUrl ? `Anmeldelink: ${data.registrationUrl}` : null,
      "Dein Platz ist fuer 96 Stunden fuer dich reserviert.",
      data.registrationExpiresAt
        ? `Reserviert bis: ${formatExpirationDateTime(data.registrationExpiresAt)}`
        : null,
      "Herzliche Gruesse",
      "SKULT",
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

function prepareTrialRegistrationReminderEmail(
  data: TrialRegistrationDecisionEmailData,
  input: { subject: string; heading: string; lead: string; remainingTime: string }
) {
  const expiresAtLine = data.registrationExpiresAt
    ? `<p><b>Reserviert bis:</b> ${formatExpirationDateTime(data.registrationExpiresAt)}</p>`
    : "";

  return {
    to: data.customerEmail,
    subject: input.subject,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5;">
        <h2>${input.heading}</h2>
        <p>Hallo ${data.customerName},</p>
        <p>${input.lead} fuer <b>${data.courseTitle}</b>.</p>
        <p>Du hast noch ${input.remainingTime} Zeit, deine verbindliche Anmeldung abzuschliessen.</p>
        <p><a href="${data.registrationUrl}">${data.registrationUrl}</a></p>
        ${expiresAtLine}
        <p>Herzliche Gruesse<br />SKULT</p>
      </div>
    `,
    text: [
      input.subject,
      `Hallo ${data.customerName},`,
      `${input.lead} fuer ${data.courseTitle}.`,
      `Du hast noch ${input.remainingTime} Zeit, deine verbindliche Anmeldung abzuschliessen.`,
      data.registrationUrl ? `Anmeldelink: ${data.registrationUrl}` : null,
      data.registrationExpiresAt
        ? `Reserviert bis: ${formatExpirationDateTime(data.registrationExpiresAt)}`
        : null,
      "Herzliche Gruesse",
      "SKULT",
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

export function prepareTrialRegistrationReminder24hEmail(data: TrialRegistrationDecisionEmailData) {
  return prepareTrialRegistrationReminderEmail(data, {
    subject: `Du hast noch 3 Tage Zeit: ${data.courseTitle}`,
    heading: "Deine Anmeldung ist weiter fuer dich reserviert",
    lead: "deine Freigabe ist weiterhin aktiv",
    remainingTime: "3 Tage",
  });
}

export function prepareTrialRegistrationReminder48hEmail(data: TrialRegistrationDecisionEmailData) {
  return prepareTrialRegistrationReminderEmail(data, {
    subject: `Du hast noch 2 Tage Zeit: ${data.courseTitle}`,
    heading: "Erinnerung an deine Anmeldung",
    lead: "dein Platz ist noch fuer dich reserviert",
    remainingTime: "2 Tage",
  });
}

export function prepareTrialRegistrationReminder72hEmail(data: TrialRegistrationDecisionEmailData) {
  return prepareTrialRegistrationReminderEmail(data, {
    subject: `Du hast noch 1 Tag Zeit: ${data.courseTitle}`,
    heading: "Letzte Erinnerung fuer deine Anmeldung",
    lead: "deine Freigabe laeuft bald ab",
    remainingTime: "1 Tag",
  });
}

export function prepareTrialRegistrationExpiredEmail(data: TrialRegistrationExpiredEmailData) {
  return {
    to: data.customerEmail,
    subject: `Dein Anmeldelink ist abgelaufen: ${data.courseTitle}`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5;">
        <h2>Dein Anmeldelink ist abgelaufen</h2>
        <p>Hallo ${data.customerName},</p>
        <p>die Reservierung fuer deine verbindliche Anmeldung zu <b>${data.courseTitle}</b> ist inzwischen abgelaufen.</p>
        <p>Wenn du weiterhin Interesse hast, schau dir gern unsere aktuellen Kurse an:</p>
        <p><a href="${data.coursesOverviewUrl}">${data.coursesOverviewUrl}</a></p>
        <p>Herzliche Gruesse<br />SKULT</p>
      </div>
    `,
    text: [
      `Dein Anmeldelink ist abgelaufen: ${data.courseTitle}`,
      `Hallo ${data.customerName},`,
      `die Reservierung fuer deine verbindliche Anmeldung zu ${data.courseTitle} ist inzwischen abgelaufen.`,
      `Kursuebersicht: ${data.coursesOverviewUrl}`,
      "Herzliche Gruesse",
      "SKULT",
    ].join("\n"),
  };
}

export function prepareTrialRegistrationRejectedEmail(data: TrialRegistrationDecisionEmailData) {
  return {
    to: data.customerEmail,
    subject: `Danke fuer deine Probestunde: ${data.courseTitle}`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5;">
        <h2>Vielen Dank fuer deine Probestunde</h2>
        <p>Hallo ${data.customerName},</p>
        <p>vielen Dank, dass du an der Probestunde fuer <b>${data.courseTitle}</b> teilgenommen hast.</p>
        <p>Nach dem Termin wurde entschieden, dass die aktuelle Kursgruppe im Moment leider nicht der richtige Rahmen fuer dich ist.</p>
        <p>Wir schaetzen dein Interesse sehr und wuerden uns freuen, wenn es zu einem spaeteren Zeitpunkt in einem anderen Format oder Kurs doch noch passt.</p>
        <p>Herzliche Gruesse<br />SKULT</p>
      </div>
    `,
    text: [
      `Danke fuer deine Probestunde: ${data.courseTitle}`,
      `Hallo ${data.customerName},`,
      `vielen Dank, dass du an der Probestunde fuer ${data.courseTitle} teilgenommen hast.`,
      "Die aktuelle Kursgruppe ist im Moment leider nicht der richtige Rahmen.",
      "Wir wuerden uns freuen, wenn es spaeter in einem anderen Format oder Kurs doch noch passt.",
      "Herzliche Gruesse",
      "SKULT",
    ].join("\n"),
  };
}

export function prepareTeacherTrialDecisionReminderEmail(data: TeacherTrialDecisionReminderEmailData) {
  return {
    to: data.teacherEmail ?? "",
    subject: `Bitte Entscheidung treffen: ${data.customerName} | ${data.courseTitle}`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5;">
        <h2>Probestunde besucht - Entscheidung offen</h2>
        <p>${data.customerName} hat die Probestunde fuer <b>${data.courseTitle}</b> besucht.</p>
        <p><b>Termin:</b> ${formatDateTimeRange(data.trialStartsAt, data.trialEndsAt)}</p>
        <p>Bitte entscheide jetzt, ob du die Anmeldung freigeben oder absagen moechtest.</p>
        <p><a href="${data.dashboardUrl}">${data.dashboardUrl}</a></p>
      </div>
    `,
    text: [
      `Bitte Entscheidung treffen: ${data.customerName} | ${data.courseTitle}`,
      `${data.customerName} hat die Probestunde besucht.`,
      `Termin: ${formatDateTimeRange(data.trialStartsAt, data.trialEndsAt)}`,
      "Bitte entscheide jetzt, ob du die Anmeldung freigeben oder absagen moechtest.",
      `Dashboard: ${data.dashboardUrl}`,
    ].join("\n"),
  };
}

export async function sendTrialReservationConfirmationEmail(data: TrialReservationEmailData) {
  const resend = getResend();
  const email = await prepareCustomerTrialReservationConfirmation(data);
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

export async function sendTrialRegistrationApprovedEmail(data: TrialRegistrationDecisionEmailData) {
  const resend = getResend();
  const email = prepareTrialRegistrationApprovedEmail(data);
  return resend.emails.send({
    from: "onboarding@resend.dev",
    to: email.to,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });
}

export async function sendTrialRegistrationRejectedEmail(data: TrialRegistrationDecisionEmailData) {
  const resend = getResend();
  const email = prepareTrialRegistrationRejectedEmail(data);
  return resend.emails.send({
    from: "onboarding@resend.dev",
    to: email.to,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });
}

export async function sendTrialRegistrationReminder24hEmail(data: TrialRegistrationDecisionEmailData) {
  const resend = getResend();
  const email = prepareTrialRegistrationReminder24hEmail(data);
  return resend.emails.send({
    from: "onboarding@resend.dev",
    to: email.to,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });
}

export async function sendTrialRegistrationReminder48hEmail(data: TrialRegistrationDecisionEmailData) {
  const resend = getResend();
  const email = prepareTrialRegistrationReminder48hEmail(data);
  return resend.emails.send({
    from: "onboarding@resend.dev",
    to: email.to,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });
}

export async function sendTrialRegistrationReminder72hEmail(data: TrialRegistrationDecisionEmailData) {
  const resend = getResend();
  const email = prepareTrialRegistrationReminder72hEmail(data);
  return resend.emails.send({
    from: "onboarding@resend.dev",
    to: email.to,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });
}

export async function sendTrialRegistrationExpiredEmail(data: TrialRegistrationExpiredEmailData) {
  const resend = getResend();
  const email = prepareTrialRegistrationExpiredEmail(data);
  return resend.emails.send({
    from: "onboarding@resend.dev",
    to: email.to,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });
}

export async function sendTeacherTrialDecisionReminderEmail(data: TeacherTrialDecisionReminderEmailData) {
  if (!data.teacherEmail) {
    console.log("[trial-decision-reminder-email] missing teacher email", {
      reservationId: data.reservationId,
      courseTitle: data.courseTitle,
    });
    return null;
  }

  const resend = getResend();
  const email = prepareTeacherTrialDecisionReminderEmail(data);
  return resend.emails.send({
    from: "onboarding@resend.dev",
    to: email.to,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });
}
