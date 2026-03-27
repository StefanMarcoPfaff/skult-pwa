import { NextResponse } from "next/server";
import { getResend } from "@/lib/resend";

export const runtime = "nodejs";

export async function GET() {
  try {
    const resend = getResend();

    const result = await resend.emails.send({
      from: "RESER <hello@getreser.app>",
      to: "stefan.marco.pfaff@gmail.com",
      subject: "RESER Testmail",
      html: "<p>Wenn du das liest, funktioniert der Mailversand von hello@getreser.app.</p>",
      replyTo: "stefan.marco.pfaff@gmail.com",
    });

    return NextResponse.json({ ok: true, result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 }
    );
  }
}
