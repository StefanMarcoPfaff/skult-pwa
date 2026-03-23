import { getResend } from "@/lib/resend";
import { shouldShowStudioLabel } from "@/lib/provider-profiles";
import { buildTicketCheckInUrl, buildTicketQrCodeDataUrl, buildTicketViewUrl } from "@/lib/ticket-qr";

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

export type CourseSubscriptionConfirmationEmailData = {
  registrationIntentId: string;
  courseTitle: string;
  providerType?: "independent_teacher" | "studio_provider" | null;
  providerName: string | null;
  instructorName: string | null;
  customerName: string;
  customerEmail: string;
  priceLabel: string | null;
  currency: string | null;
  cancellationLabel: string | null;
  location: string | null;
  locationDetails: string | null;
  qrToken?: string | null;
};

export type CourseSubscriptionProviderNotificationEmailData = {
  registrationIntentId: string;
  teacherEmail: string | null;
  participantName: string;
  participantEmail: string;
  participantPhone?: string | null;
  courseTitle: string;
  providerName: string | null;
  instructorName: string | null;
  priceLabel: string | null;
  cancellationLabel: string | null;
};

export type CourseEndingNotificationEmailData = {
  registrationIntentId: string;
  courseTitle: string;
  providerType?: "independent_teacher" | "studio_provider" | null;
  providerName: string | null;
  instructorName: string | null;
  customerName: string;
  customerEmail: string;
  courseEndsAt: string;
  cancellationLabel: string | null;
  location: string | null;
  locationDetails: string | null;
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

type EmailAction = {
  label: string;
  href: string;
};

type InfoItem = {
  label: string;
  value: string | null | undefined;
};

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
        <td style="padding: 6px 0; vertical-align: top; color: #5b6470; width: 150px;"><b>${item.label}</b></td>
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

function renderSupportHtml() {
  return `<p style="margin: 24px 0 0; color: #4b5563;">Wenn du Fragen hast, helfen wir dir gerne weiter.</p>`;
}

function renderFooterHtml() {
  return `<p style="margin: 24px 0 0;">Herzliche Grüße<br />SKULT</p>`;
}

function buildProviderInfoItems(input: {
  providerType?: "independent_teacher" | "studio_provider" | null;
  providerName: string | null;
  instructorName: string | null;
}): InfoItem[] {
  return [
    ...(shouldShowStudioLabel(input.providerType)
      ? [{ label: "Anbieter / Studio", value: input.providerName }]
      : []),
    { label: "Dozent", value: input.instructorName },
  ];
}

function createHtmlEmail(input: {
  title: string;
  greeting?: string;
  intro: string;
  infoItems?: InfoItem[];
  nextSteps?: string[];
  actions?: EmailAction[];
  support?: string;
}) {
  const greeting = input.greeting ? `<p style="margin: 0 0 16px;">Hallo ${input.greeting},</p>` : "";
  const infoBlock = renderInfoBlockHtml(input.infoItems ?? []);
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
      ${input.support ?? renderSupportHtml()}
      ${renderFooterHtml()}
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
    "Herzliche Grüße",
    "SKULT",
  ]
    .filter(Boolean)
    .join("\n");
}

async function getQrLines(
  qrToken?: string | null,
  options?: {
    htmlLead?: string;
    textLead?: string;
    imageAlt?: string;
  }
) {
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
      <p>${options?.htmlLead ?? "Bitte bring dieses QR-Ticket mit. Es wird bei deiner Ankunft gescannt."}</p>
      <p><img src="${qrDataUrl}" alt="${options?.imageAlt ?? "QR-Ticket"}" width="180" height="180" /></p>
      <p><a href="${checkInUrl}">${checkInUrl}</a></p>
    `,
    text: [
      options?.textLead ?? "Bitte bring dieses QR-Ticket mit. Es wird bei deiner Ankunft gescannt.",
      `Check-in-Link: ${checkInUrl}`,
    ],
  };
}

export async function prepareCustomerTrialReservationConfirmation(data: TrialReservationEmailData) {
  const qrLines = await getQrLines(data.qrToken);
  const ticketUrl = data.qrToken ? buildTicketViewUrl(data.qrToken) : null;

  return {
    to: data.customerEmail,
    subject: `Deine Probestunde ist reserviert 🎉 ${data.courseTitle}`,
    html:
      createHtmlEmail({
        title: "Deine Probestunde ist reserviert 🎉",
        greeting: data.customerName,
        intro: `Deine Reservierung für <b>${data.courseTitle}</b> war erfolgreich. Alle wichtigen Informationen findest du hier auf einen Blick.`,
        infoItems: [
          { label: "Kurs", value: data.courseTitle },
          { label: "Dozent", value: data.teacherName },
          { label: "Termin", value: formatDateTimeRange(data.trialStartsAt, data.trialEndsAt) },
          { label: "Ort", value: data.location },
        ],
        nextSteps: [
          "Bitte bring dein Ticket zum Termin mit.",
          "Falls du doch nicht teilnehmen kannst, storniere bitte möglichst frühzeitig, damit der Platz wieder frei wird.",
        ],
        actions: [
          ...(ticketUrl ? [{ label: "Ticket ansehen", href: ticketUrl }] : []),
          { label: "Zu meinen Kursen", href: buildAbsoluteUrl("/courses") },
          { label: "Reservierung stornieren", href: data.cancelUrl },
        ],
        support: `${qrLines.html}<p style="margin: 18px 0 0; color: #4b5563;">Wenn du Fragen hast, helfen wir dir gerne weiter.</p>`,
      }),
    text: createTextEmail({
      title: "Deine Probestunde ist reserviert 🎉",
      greeting: data.customerName,
      intro: `Deine Reservierung für ${data.courseTitle} war erfolgreich. Alle wichtigen Informationen findest du hier auf einen Blick.`,
      infoItems: [
        { label: "Kurs", value: data.courseTitle },
        { label: "Dozent", value: data.teacherName },
        { label: "Termin", value: formatDateTimeRange(data.trialStartsAt, data.trialEndsAt) },
        { label: "Ort", value: data.location },
      ],
      nextSteps: [
        "Bitte bring dein Ticket zum Termin mit.",
        "Falls du doch nicht teilnehmen kannst, storniere bitte möglichst frühzeitig, damit der Platz wieder frei wird.",
        ...qrLines.text,
      ],
      actions: [
        ...(ticketUrl ? [{ label: "Ticket ansehen", href: ticketUrl }] : []),
        { label: "Zu meinen Kursen", href: buildAbsoluteUrl("/courses") },
        { label: "Reservierung stornieren", href: data.cancelUrl },
      ],
    }),
  };
}

export function prepareCustomerTrialReservationReminder(data: TrialReservationEmailData) {
  return {
    to: data.customerEmail,
    subject: "Erinnerung an deine Probestunde morgen",
    html: createHtmlEmail({
      title: "Erinnerung an deine Probestunde",
      greeting: data.customerName,
      intro: `Morgen findet deine reservierte Probestunde für <b>${data.courseTitle}</b> statt.`,
      infoItems: [
        { label: "Kurs", value: data.courseTitle },
        { label: "Dozent", value: data.teacherName },
        { label: "Termin", value: formatDateTimeRange(data.trialStartsAt, data.trialEndsAt) },
        { label: "Ort", value: data.location },
      ],
      nextSteps: [
        "Bitte plane genug Zeit für deine Anreise ein.",
        "Falls du doch nicht teilnehmen kannst, storniere bitte rechtzeitig.",
      ],
      actions: [{ label: "Reservierung stornieren", href: data.cancelUrl }],
    }),
    text: createTextEmail({
      title: "Erinnerung an deine Probestunde",
      greeting: data.customerName,
      intro: `Morgen findet deine reservierte Probestunde für ${data.courseTitle} statt.`,
      infoItems: [
        { label: "Kurs", value: data.courseTitle },
        { label: "Dozent", value: data.teacherName },
        { label: "Termin", value: formatDateTimeRange(data.trialStartsAt, data.trialEndsAt) },
        { label: "Ort", value: data.location },
      ],
      nextSteps: [
        "Bitte plane genug Zeit für deine Anreise ein.",
        "Falls du doch nicht teilnehmen kannst, storniere bitte rechtzeitig.",
      ],
      actions: [{ label: "Reservierung stornieren", href: data.cancelUrl }],
    }),
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
  const teacherEmail = data.teacherEmail ?? "";

  return {
    to: teacherEmail,
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

export function prepareCustomerTrialReservationCancellation(data: TrialReservationEmailData) {
  return {
    to: data.customerEmail,
    subject: `Deine Probestunde wurde storniert: ${data.courseTitle}`,
    html: createHtmlEmail({
      title: "Deine Probestunde wurde storniert",
      greeting: data.customerName,
      intro: `Deine Probestunden-Reservierung für <b>${data.courseTitle}</b> wurde erfolgreich storniert.`,
      infoItems: [
        { label: "Kurs", value: data.courseTitle },
        { label: "Termin", value: formatDateTimeRange(data.trialStartsAt, data.trialEndsAt) },
        { label: "Ort", value: data.location },
      ],
      nextSteps: ["Wenn du weiterhin Interesse hast, kannst du später jederzeit erneut eine Probestunde anfragen."],
      actions: [{ label: "Zu den Kursen", href: buildAbsoluteUrl("/courses") }],
    }),
    text: createTextEmail({
      title: "Deine Probestunde wurde storniert",
      greeting: data.customerName,
      intro: `Deine Probestunden-Reservierung für ${data.courseTitle} wurde erfolgreich storniert.`,
      infoItems: [
        { label: "Kurs", value: data.courseTitle },
        { label: "Termin", value: formatDateTimeRange(data.trialStartsAt, data.trialEndsAt) },
        { label: "Ort", value: data.location },
      ],
      nextSteps: ["Wenn du weiterhin Interesse hast, kannst du später jederzeit erneut eine Probestunde anfragen."],
      actions: [{ label: "Zu den Kursen", href: buildAbsoluteUrl("/courses") }],
    }),
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
  return {
    to: data.customerEmail,
    subject: `Deine Anmeldung ist jetzt möglich ✨ ${data.courseTitle}`,
    html: createHtmlEmail({
      title: "Deine Anmeldung ist jetzt möglich ✨",
      greeting: data.customerName,
      intro: `Nach deiner Probestunde kannst du dich jetzt verbindlich für <b>${data.courseTitle}</b> anmelden.`,
      infoItems: [
        { label: "Kurs", value: data.courseTitle },
        {
          label: "Reserviert bis",
          value: data.registrationExpiresAt ? formatExpirationDateTime(data.registrationExpiresAt) : null,
        },
      ],
      nextSteps: [
        "Dein Platz ist für 96 Stunden für dich reserviert.",
        "Schließe deine Anmeldung bitte innerhalb dieses Zeitfensters ab.",
      ],
      actions: data.registrationUrl
        ? [
            { label: "Jetzt anmelden", href: data.registrationUrl },
            { label: "Zu meinen Kursen", href: buildAbsoluteUrl("/courses") },
          ]
        : [{ label: "Zu meinen Kursen", href: buildAbsoluteUrl("/courses") }],
    }),
    text: createTextEmail({
      title: "Deine Anmeldung ist jetzt möglich ✨",
      greeting: data.customerName,
      intro: `Nach deiner Probestunde kannst du dich jetzt verbindlich für ${data.courseTitle} anmelden.`,
      infoItems: [
        { label: "Kurs", value: data.courseTitle },
        {
          label: "Reserviert bis",
          value: data.registrationExpiresAt ? formatExpirationDateTime(data.registrationExpiresAt) : null,
        },
      ],
      nextSteps: [
        "Dein Platz ist für 96 Stunden für dich reserviert.",
        "Schließe deine Anmeldung bitte innerhalb dieses Zeitfensters ab.",
      ],
      actions: data.registrationUrl
        ? [
            { label: "Jetzt anmelden", href: data.registrationUrl },
            { label: "Zu meinen Kursen", href: buildAbsoluteUrl("/courses") },
          ]
        : [{ label: "Zu meinen Kursen", href: buildAbsoluteUrl("/courses") }],
    }),
  };
}

function prepareTrialRegistrationReminderEmail(
  data: TrialRegistrationDecisionEmailData,
  input: { subject: string; heading: string; lead: string; remainingTime: string }
) {
  const expiresAtLine = data.registrationExpiresAt
    ? formatExpirationDateTime(data.registrationExpiresAt)
    : null;

  return {
    to: data.customerEmail,
    subject: input.subject,
    html: createHtmlEmail({
      title: input.heading,
      greeting: data.customerName,
      intro: `${input.lead} für <b>${data.courseTitle}</b>.`,
      infoItems: [
        { label: "Kurs", value: data.courseTitle },
        { label: "Verbleibende Zeit", value: input.remainingTime },
        { label: "Reserviert bis", value: expiresAtLine },
      ],
      nextSteps: ["Schließe deine verbindliche Anmeldung rechtzeitig ab, damit dein Platz gesichert bleibt."],
      actions: data.registrationUrl ? [{ label: "Jetzt anmelden", href: data.registrationUrl }] : [],
    }),
    text: createTextEmail({
      title: input.heading,
      greeting: data.customerName,
      intro: `${input.lead} für ${data.courseTitle}.`,
      infoItems: [
        { label: "Kurs", value: data.courseTitle },
        { label: "Verbleibende Zeit", value: input.remainingTime },
        { label: "Reserviert bis", value: expiresAtLine },
      ],
      nextSteps: ["Schließe deine verbindliche Anmeldung rechtzeitig ab, damit dein Platz gesichert bleibt."],
      actions: data.registrationUrl ? [{ label: "Jetzt anmelden", href: data.registrationUrl }] : [],
    }),
  };
}

export function prepareTrialRegistrationReminder24hEmail(data: TrialRegistrationDecisionEmailData) {
  return prepareTrialRegistrationReminderEmail(data, {
    subject: `Du hast noch 3 Tage Zeit: ${data.courseTitle}`,
    heading: "Deine Anmeldung ist weiterhin für dich reserviert",
    lead: "Deine Freigabe ist weiterhin aktiv",
    remainingTime: "3 Tage",
  });
}

export function prepareTrialRegistrationReminder48hEmail(data: TrialRegistrationDecisionEmailData) {
  return prepareTrialRegistrationReminderEmail(data, {
    subject: `Du hast noch 2 Tage Zeit: ${data.courseTitle}`,
    heading: "Erinnerung an deine Anmeldung",
    lead: "Dein Platz ist noch für dich reserviert",
    remainingTime: "2 Tage",
  });
}

export function prepareTrialRegistrationReminder72hEmail(data: TrialRegistrationDecisionEmailData) {
  return prepareTrialRegistrationReminderEmail(data, {
    subject: `Du hast noch 1 Tag Zeit: ${data.courseTitle}`,
    heading: "Letzte Erinnerung für deine Anmeldung",
    lead: "Deine Freigabe läuft bald ab",
    remainingTime: "1 Tag",
  });
}

export function prepareTrialRegistrationExpiredEmail(data: TrialRegistrationExpiredEmailData) {
  return {
    to: data.customerEmail,
    subject: `Dein Anmeldelink ist abgelaufen: ${data.courseTitle}`,
    html: createHtmlEmail({
      title: "Dein Anmeldelink ist abgelaufen",
      greeting: data.customerName,
      intro: `Die Reservierung für deine verbindliche Anmeldung zu <b>${data.courseTitle}</b> ist inzwischen abgelaufen.`,
      infoItems: [{ label: "Kurs", value: data.courseTitle }],
      nextSteps: ["Wenn du weiterhin Interesse hast, schau dir gerne unsere aktuellen Kurse an."],
      actions: [{ label: "Zu meinen Kursen", href: data.coursesOverviewUrl }],
    }),
    text: createTextEmail({
      title: "Dein Anmeldelink ist abgelaufen",
      greeting: data.customerName,
      intro: `Die Reservierung für deine verbindliche Anmeldung zu ${data.courseTitle} ist inzwischen abgelaufen.`,
      infoItems: [{ label: "Kurs", value: data.courseTitle }],
      nextSteps: ["Wenn du weiterhin Interesse hast, schau dir gerne unsere aktuellen Kurse an."],
      actions: [{ label: "Zu meinen Kursen", href: data.coursesOverviewUrl }],
    }),
  };
}

export async function prepareCourseSubscriptionConfirmationEmail(
  data: CourseSubscriptionConfirmationEmailData
) {
  const qrLines = await getQrLines(data.qrToken, {
    htmlLead:
      "Dein Ticket ist bereits aktiv. Bitte zeige es künftig für Anwesenheit und Check-in im Kurs vor.",
    textLead:
      "Dein Ticket ist bereits aktiv. Bitte zeige es künftig für Anwesenheit und Check-in im Kurs vor.",
    imageAlt: "QR-Ticket für deine Kursanmeldung",
  });
  const ticketUrl = data.qrToken ? buildTicketViewUrl(data.qrToken) : null;

  return {
    to: data.customerEmail,
    subject: `Deine Anmeldung war erfolgreich 🎉 ${data.courseTitle}`,
    html:
      createHtmlEmail({
        title: "Deine Anmeldung war erfolgreich 🎉",
        greeting: data.customerName,
        intro: `Deine verbindliche Anmeldung für <b>${data.courseTitle}</b> wurde erfolgreich abgeschlossen. Deine Zahlung ist bestätigt.`,
        infoItems: [
          { label: "Kursname", value: data.courseTitle },
          ...buildProviderInfoItems(data),
          { label: "Preis", value: data.priceLabel },
          { label: "Kündigungsbedingungen", value: data.cancellationLabel },
          { label: "Ort", value: data.location },
          { label: "Weitere Infos", value: data.locationDetails },
          { label: "Währung", value: data.currency },
        ],
        nextSteps: [
          "Dein Platz ist fest für dich eingeplant.",
          "Weitere organisatorische Informationen erhältst du bei Bedarf separat.",
        ],
        actions: [
          ...(ticketUrl ? [{ label: "Ticket ansehen", href: ticketUrl }] : []),
          { label: "Zu meinen Kursen", href: buildAbsoluteUrl("/courses") },
        ],
        support: `${qrLines.html}<p style="margin: 18px 0 0; color: #4b5563;">Wenn du Fragen hast, helfen wir dir gerne weiter.</p>`,
      }),
    text: createTextEmail({
      title: "Deine Anmeldung war erfolgreich 🎉",
      greeting: data.customerName,
      intro: `Deine verbindliche Anmeldung für ${data.courseTitle} wurde erfolgreich abgeschlossen. Deine Zahlung ist bestätigt.`,
      infoItems: [
        { label: "Kursname", value: data.courseTitle },
        ...buildProviderInfoItems(data),
        { label: "Preis", value: data.priceLabel },
        { label: "Kündigungsbedingungen", value: data.cancellationLabel },
        { label: "Ort", value: data.location },
        { label: "Weitere Infos", value: data.locationDetails },
        { label: "Währung", value: data.currency },
      ],
      nextSteps: [
        "Dein Platz ist fest für dich eingeplant.",
        "Weitere organisatorische Informationen erhältst du bei Bedarf separat.",
        ...qrLines.text,
      ],
      actions: [
        ...(ticketUrl ? [{ label: "Ticket ansehen", href: ticketUrl }] : []),
        { label: "Zu meinen Kursen", href: buildAbsoluteUrl("/courses") },
      ],
    }),
  };
}

export function prepareCourseSubscriptionProviderNotificationEmail(
  data: CourseSubscriptionProviderNotificationEmailData
) {
  return {
    to: data.teacherEmail ?? "",
    subject: `Neue verbindliche Anmeldung: ${data.courseTitle}`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5;">
        <h2>Neue verbindliche Anmeldung</h2>
        <p><b>${data.participantName}</b> hat die verbindliche Anmeldung für <b>${data.courseTitle}</b> erfolgreich abgeschlossen.</p>
        <p><b>Name:</b> ${data.participantName}</p>
        <p><b>E-Mail:</b> ${data.participantEmail}</p>
        ${data.participantPhone ? `<p><b>Telefon:</b> ${data.participantPhone}</p>` : ""}
        ${data.providerName ? `<p><b>Anbieter / Studio:</b> ${data.providerName}</p>` : ""}
        ${data.instructorName ? `<p><b>Dozent:</b> ${data.instructorName}</p>` : ""}
        ${data.priceLabel ? `<p><b>Preis:</b> ${data.priceLabel}</p>` : ""}
        ${data.cancellationLabel ? `<p><b>Kündigungsbedingungen:</b> ${data.cancellationLabel}</p>` : ""}
      </div>
    `,
    text: [
      `Neue verbindliche Anmeldung: ${data.courseTitle}`,
      `${data.participantName} hat die verbindliche Anmeldung erfolgreich abgeschlossen.`,
      `Name: ${data.participantName}`,
      `E-Mail: ${data.participantEmail}`,
      data.participantPhone ? `Telefon: ${data.participantPhone}` : null,
      data.providerName ? `Anbieter / Studio: ${data.providerName}` : null,
      data.instructorName ? `Dozent: ${data.instructorName}` : null,
      data.priceLabel ? `Preis: ${data.priceLabel}` : null,
      data.cancellationLabel ? `Kündigungsbedingungen: ${data.cancellationLabel}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

export function prepareCourseEndingNotificationEmail(data: CourseEndingNotificationEmailData) {
  const endDate = new Date(data.courseEndsAt).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  return {
    to: data.customerEmail,
    subject: `Wichtige Info: ${data.courseTitle} endet am ${endDate}`,
    html: createHtmlEmail({
      title: "Wichtige Änderung zu deinem Kurs",
      greeting: data.customerName,
      intro: `Dein Kurs <b>${data.courseTitle}</b> wird zum <b>${endDate}</b> beendet.`,
      infoItems: [
        { label: "Kursname", value: data.courseTitle },
        ...buildProviderInfoItems(data),
        { label: "Letzter Kurstag", value: endDate },
        { label: "Ort", value: data.location },
        { label: "Weitere Infos", value: data.locationDetails },
        { label: "Kündigungsregelung", value: data.cancellationLabel },
      ],
      nextSteps: [
        "Dein laufendes Abo wird automatisch zu diesem Datum beendet.",
        "Du musst dafür nichts weiter unternehmen.",
        "Falls es organisatorische Rückfragen gibt, melden wir uns separat bei dir.",
      ],
      actions: [{ label: "Zu meinen Kursen", href: buildAbsoluteUrl("/courses") }],
    }),
    text: createTextEmail({
      title: "Wichtige Änderung zu deinem Kurs",
      greeting: data.customerName,
      intro: `Dein Kurs ${data.courseTitle} wird zum ${endDate} beendet.`,
      infoItems: [
        { label: "Kursname", value: data.courseTitle },
        ...buildProviderInfoItems(data),
        { label: "Letzter Kurstag", value: endDate },
        { label: "Ort", value: data.location },
        { label: "Weitere Infos", value: data.locationDetails },
        { label: "Kündigungsregelung", value: data.cancellationLabel },
      ],
      nextSteps: [
        "Dein laufendes Abo wird automatisch zu diesem Datum beendet.",
        "Du musst dafür nichts weiter unternehmen.",
        "Falls es organisatorische Rückfragen gibt, melden wir uns separat bei dir.",
      ],
      actions: [{ label: "Zu meinen Kursen", href: buildAbsoluteUrl("/courses") }],
    }),
  };
}

export function prepareTrialRegistrationRejectedEmail(data: TrialRegistrationDecisionEmailData) {
  return {
    to: data.customerEmail,
    subject: `Danke für deine Probestunde: ${data.courseTitle}`,
    html: createHtmlEmail({
      title: "Vielen Dank für deine Probestunde",
      greeting: data.customerName,
      intro: `Vielen Dank, dass du an der Probestunde für <b>${data.courseTitle}</b> teilgenommen hast.`,
      infoItems: [{ label: "Kurs", value: data.courseTitle }],
      nextSteps: [
        "Nach dem Termin wurde entschieden, dass die aktuelle Gruppe im Moment leider nicht der richtige Rahmen ist.",
        "Wenn es zu einem späteren Zeitpunkt besser passt, freuen wir uns sehr über ein Wiedersehen.",
      ],
      actions: [{ label: "Zu meinen Kursen", href: buildAbsoluteUrl("/courses") }],
    }),
    text: createTextEmail({
      title: "Vielen Dank für deine Probestunde",
      greeting: data.customerName,
      intro: `Vielen Dank, dass du an der Probestunde für ${data.courseTitle} teilgenommen hast.`,
      infoItems: [{ label: "Kurs", value: data.courseTitle }],
      nextSteps: [
        "Nach dem Termin wurde entschieden, dass die aktuelle Gruppe im Moment leider nicht der richtige Rahmen ist.",
        "Wenn es zu einem späteren Zeitpunkt besser passt, freuen wir uns sehr über ein Wiedersehen.",
      ],
      actions: [{ label: "Zu meinen Kursen", href: buildAbsoluteUrl("/courses") }],
    }),
  };
}

export function prepareTeacherTrialDecisionReminderEmail(data: TeacherTrialDecisionReminderEmailData) {
  return {
    to: data.teacherEmail ?? "",
    subject: `Bitte Entscheidung treffen: ${data.customerName} | ${data.courseTitle}`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5;">
        <h2>Probestunde besucht - Entscheidung offen</h2>
        <p>${data.customerName} hat die Probestunde für <b>${data.courseTitle}</b> besucht.</p>
        <p><b>Termin:</b> ${formatDateTimeRange(data.trialStartsAt, data.trialEndsAt)}</p>
        <p>Bitte entscheide jetzt, ob du die Anmeldung freigeben oder absagen möchtest.</p>
        <p><a href="${data.dashboardUrl}">${data.dashboardUrl}</a></p>
      </div>
    `,
    text: [
      `Bitte Entscheidung treffen: ${data.customerName} | ${data.courseTitle}`,
      `${data.customerName} hat die Probestunde besucht.`,
      `Termin: ${formatDateTimeRange(data.trialStartsAt, data.trialEndsAt)}`,
      "Bitte entscheide jetzt, ob du die Anmeldung freigeben oder absagen möchtest.",
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

export async function sendCustomerTrialReservationCancellationEmail(data: TrialReservationEmailData) {
  const resend = getResend();
  const email = prepareCustomerTrialReservationCancellation(data);
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

export async function sendCourseSubscriptionConfirmationEmail(
  data: CourseSubscriptionConfirmationEmailData
) {
  const resend = getResend();
  const email = await prepareCourseSubscriptionConfirmationEmail(data);
  return resend.emails.send({
    from: "onboarding@resend.dev",
    to: email.to,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });
}

export async function sendCourseSubscriptionProviderNotificationEmail(
  data: CourseSubscriptionProviderNotificationEmailData
) {
  if (!data.teacherEmail) {
    console.log("[course-subscription-email] missing teacher email", {
      registrationIntentId: data.registrationIntentId,
      courseTitle: data.courseTitle,
    });
    return null;
  }

  const resend = getResend();
  const email = prepareCourseSubscriptionProviderNotificationEmail(data);
  return resend.emails.send({
    from: "onboarding@resend.dev",
    to: email.to,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });
}

export async function sendCourseEndingNotificationEmail(data: CourseEndingNotificationEmailData) {
  const resend = getResend();
  const email = prepareCourseEndingNotificationEmail(data);
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
