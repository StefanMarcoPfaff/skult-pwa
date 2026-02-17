import { Resend } from "resend";

export function getResend() {
  const key = process.env.RESEND_API_KEY;

  if (!key) {
    // Damit es richtig im Terminal sichtbar ist
    console.error("[Resend] RESEND_API_KEY fehlt in process.env");
    throw new Error("RESEND_API_KEY fehlt. Prüfe deine .env.local und Server-Neustart.");
  }

  return new Resend(key);
}
