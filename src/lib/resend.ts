import { Resend } from "resend";

export const RESEND_FROM_EMAIL = "hello@getreser.app";
export const RESEND_FROM_NAME = "RESER";
export const RESEND_FROM = `${RESEND_FROM_NAME} <${RESEND_FROM_EMAIL}>`;

export function getResend() {
  const key = process.env.RESEND_API_KEY;

  if (!key) {
    // Damit es richtig im Terminal sichtbar ist
    console.error("[Resend] RESEND_API_KEY fehlt in process.env");
    throw new Error("RESEND_API_KEY fehlt. Prüfe deine .env.local und Server-Neustart.");
  }

  return new Resend(key);
}

type SendEmailOptions = Parameters<Resend["emails"]["send"]>[0];

export function getResendFromAddress() {
  return RESEND_FROM;
}

export async function sendResendEmail(email: Omit<SendEmailOptions, "from">) {
  const resend = getResend();
  return resend.emails.send({
    from: getResendFromAddress(),
    ...email,
  });
}
