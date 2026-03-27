import { Resend, type CreateEmailOptions } from "resend";

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

type SendEmailOptions = Omit<CreateEmailOptions, "from">;
type TemplateEmailOptions = Omit<Extract<CreateEmailOptions, { template: { id: string } }>, "from">;
type ReactEmailOptions = Omit<Extract<CreateEmailOptions, { react: unknown }>, "from">;
type HtmlEmailOptions = Omit<Extract<CreateEmailOptions, { html: string }>, "from">;
type TextEmailOptions = Omit<Extract<CreateEmailOptions, { text: string }>, "from">;
type NonTemplateEmailOptions = ReactEmailOptions | HtmlEmailOptions | TextEmailOptions;

export function getResendFromAddress() {
  return RESEND_FROM;
}

function hasTemplate(email: SendEmailOptions): email is TemplateEmailOptions {
  return "template" in email && email.template !== undefined;
}

function hasReact(email: SendEmailOptions): email is ReactEmailOptions {
  return "react" in email && email.react !== undefined;
}

function hasHtml(email: SendEmailOptions): email is HtmlEmailOptions {
  return "html" in email && email.html !== undefined;
}

function hasText(email: SendEmailOptions): email is TextEmailOptions {
  return "text" in email && email.text !== undefined;
}

export async function sendResendEmail(email: SendEmailOptions) {
  const resend = getResend();

  if (hasTemplate(email)) {
    const payload: Extract<CreateEmailOptions, { template: { id: string } }> = {
      from: getResendFromAddress(),
      ...email,
    };

    return resend.emails.send(payload);
  }

  if (hasReact(email)) {
    return resend.emails.send({
      from: getResendFromAddress(),
      ...email,
    });
  }

  if (hasHtml(email)) {
    return resend.emails.send({
      from: getResendFromAddress(),
      ...email,
    });
  }

  if (hasText(email)) {
    return resend.emails.send({
      from: getResendFromAddress(),
      ...email,
    });
  }

  throw new Error("sendResendEmail requires template, react, html, or text.");
}
