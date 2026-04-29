import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { isPubliclyVisibleOffer } from "@/lib/public-offer-visibility";
import { sendResendEmail } from "@/lib/resend";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { courseId, email } = (await req.json()) as { courseId?: string; email?: string };
    if (!courseId) return NextResponse.json({ ok: false, error: "courseId fehlt" }, { status: 400 });
    if (!email) return NextResponse.json({ ok: false, error: "email fehlt" }, { status: 400 });

    const admin = createSupabaseAdmin();
    const { data: course, error: courseErr } = await admin
      .from("courses")
      .select("id, kind, title, location, starts_at, ends_at, is_published, status")
      .eq("id", courseId)
      .single();

    if (courseErr || !course) {
      return NextResponse.json({ ok: false, error: "Kurs nicht gefunden" }, { status: 404 });
    }
    if (!course.is_published) {
      return NextResponse.json({ ok: false, error: "Kurs ist nicht veroeffentlicht" }, { status: 400 });
    }
    if (course.kind !== "course") {
      return NextResponse.json({ ok: false, error: "Nur fuer Kurse (Probestunde)" }, { status: 400 });
    }
    if (
      !isPubliclyVisibleOffer({
        kind: course.kind,
        status: course.status,
        isPublished: course.is_published,
        startsAt: course.starts_at,
        endsAt: course.ends_at,
      })
    ) {
      return NextResponse.json(
        { ok: false, error: "Dieser Kurs ist oeffentlich nicht mehr verfuegbar." },
        { status: 404 }
      );
    }
    if (!course.starts_at) {
      return NextResponse.json(
        { ok: false, error: "Fuer V1 braucht der Kurs ein Startdatum (Probestunde-Termin)." },
        { status: 400 }
      );
    }

    const attendeeKey = randomUUID();
    const { data: booking, error: insErr } = await admin
      .from("bookings")
      .insert({
        course_id: course.id,
        attendee_key: attendeeKey,
        status: "trial_reserved",
        starts_at: course.starts_at,
        customer_email: email,
      })
      .select("id, attendee_key")
      .single();

    if (insErr) {
      return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const ticketUrl = `${siteUrl}/ticket/${attendeeKey}`;

    await sendResendEmail({
      to: email,
      subject: `Probestunde bestaetigt: ${course.title}`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.5;">
          <h2>Deine Probestunde ist reserviert.</h2>
          <p>Hallo!</p>
          <p>Du hast eine kostenlose Probestunde fuer <b>${course.title}</b> reserviert.</p>
          <p><b>Ort:</b> ${course.location ?? "-"}<br/>
             <b>Zeit:</b> ${new Date(course.starts_at).toLocaleString("de-DE")}</p>
          <p>Hier ist dein Ticket (QR-Code):</p>
          <p><a href="${ticketUrl}">${ticketUrl}</a></p>
          <p style="margin-top: 18px;">
            Wichtig: Bitte zeige das Ticket bei der Probestunde vor (Dozent*in scannt den QR-Code).
          </p>
          <p>Liebe Gruesse<br/>RESER</p>
        </div>
      `,
    });

    return NextResponse.json({ ok: true, ticketUrl, bookingId: booking.id });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Serverfehler";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
