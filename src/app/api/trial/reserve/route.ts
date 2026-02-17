import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getResend } from "@/lib/resend";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { courseId, email } = (await req.json()) as { courseId?: string; email?: string };
    if (!courseId) return NextResponse.json({ ok: false, error: "courseId fehlt" }, { status: 400 });
    if (!email) return NextResponse.json({ ok: false, error: "email fehlt" }, { status: 400 });

    const admin = createSupabaseAdmin();

    // Kurs laden (muss veröffentlicht sein + kind=course)
    const { data: course, error: courseErr } = await admin
      .from("courses")
      .select("id, kind, title, location, starts_at, is_published")
      .eq("id", courseId)
      .single();

    if (courseErr || !course) {
      return NextResponse.json({ ok: false, error: "Kurs nicht gefunden" }, { status: 404 });
    }
    if (!course.is_published) {
      return NextResponse.json({ ok: false, error: "Kurs ist nicht veröffentlicht" }, { status: 400 });
    }
    if (course.kind !== "course") {
      return NextResponse.json({ ok: false, error: "Nur für Kurse (Probestunde)" }, { status: 400 });
    }

    // Für V1 nehmen wir course.starts_at als Probestunden-Termin (später: echte Slots)
    if (!course.starts_at) {
      return NextResponse.json(
        { ok: false, error: "Für V1 braucht der Kurs ein Startdatum (Probestunde-Termin)." },
        { status: 400 }
      );
    }

    const attendeeKey = randomUUID();

    // Booking anlegen: wir nutzen deine bestehende bookings-Tabelle.
    // Annahme: bookings hat mindestens course_id, attendee_key, status, created_at, checked_in_at (wie beim Workshop-System).
    const { data: booking, error: insErr } = await admin
      .from("bookings")
      .insert({
        course_id: course.id,
        attendee_key: attendeeKey,
        status: "trial_reserved", // neu (V1): reserviert / kostenlos
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

    // Mail senden
    const resend = getResend();
    await resend.emails.send({
      from: "onboarding@resend.dev",
      to: email,
      subject: `Probestunde bestätigt: ${course.title}`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.5;">
          <h2>Deine Probestunde ist reserviert ✅</h2>
          <p>Hallo!</p>
          <p>Du hast eine kostenlose Probestunde für <b>${course.title}</b> reserviert.</p>
          <p><b>Ort:</b> ${course.location ?? "—"}<br/>
             <b>Zeit:</b> ${new Date(course.starts_at).toLocaleString("de-DE")}</p>

          <p>Hier ist dein Ticket (QR-Code):</p>
          <p><a href="${ticketUrl}">${ticketUrl}</a></p>

          <p style="margin-top: 18px;">
            Wichtig: Bitte zeige das Ticket bei der Probestunde vor (Dozent*in scannt den QR-Code).
          </p>

          <p>Liebe Grüße<br/>SKULT-Team<br/><small>für alle Nutzer*innen</small></p>
        </div>
      `,
    });

    return NextResponse.json({ ok: true, ticketUrl, bookingId: booking.id });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Serverfehler" }, { status: 500 });
  }
}
