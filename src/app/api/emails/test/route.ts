console.log("RESEND_API_KEY exists?", Boolean(process.env.RESEND_API_KEY));
import { NextResponse } from "next/server";
import { sendResendEmail } from "@/lib/resend";

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

    const result = await sendResendEmail({
      to,
      subject: "Test-Mail (SKULT)",
      text: "Wenn du das liest: Resend laeuft.",
    });

    return NextResponse.json({ ok: true, result });
  } catch (err: unknown) {
    console.error("[/api/emails/test] ERROR:", err);
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;

    return NextResponse.json(
      {
        ok: false,
        error: message,
        stack: process.env.NODE_ENV === "development" ? stack : undefined,
      },
      { status: 500 }
    );
  }
}
