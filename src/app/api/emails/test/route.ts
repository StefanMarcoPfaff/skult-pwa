console.log("RESEND_API_KEY exists?", Boolean(process.env.RESEND_API_KEY));
import { NextResponse } from "next/server";
import { getResend } from "@/lib/resend";

export const runtime = "nodejs"; // wichtig

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const to = body?.to;

    if (!to) {
      return NextResponse.json(
        { ok: false, error: 'Missing "to" in body' },
        { status: 400 }
      );
    }

    const resend = getResend();

    // Für Tests ohne Domain nutzen wir Resend-Default:
    // Resend akzeptiert in der Regel "onboarding@resend.dev" für Tests.
    const from = "onboarding@resend.dev";

    const result = await resend.emails.send({
      from,
      to,
      subject: "Test-Mail (SKULT)",
      text: "Wenn du das liest: Resend läuft ✅",
    });

    return NextResponse.json({ ok: true, result });
  } catch (err: any) {
    // DAS ist der Teil, der dir bisher fehlt:
    console.error("[/api/emails/test] ERROR:", err);

    return NextResponse.json(
      {
        ok: false,
        error: err?.message ?? String(err),
        stack: process.env.NODE_ENV === "development" ? err?.stack : undefined,
      },
      { status: 500 }
    );
  }
}
