import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { attendeeKey } = (await req.json()) as { attendeeKey?: string };
    if (!attendeeKey) {
      return NextResponse.json({ error: "missing attendeeKey" }, { status: 400 });
    }

    const supabase = await createClient();

    // 1) Booking finden
    const { data: booking, error: bookingErr } = await supabase
      .from("bookings")
      .select("id, attendee_key, status, checked_in_at, course_id")
      .eq("attendee_key", attendeeKey)
      .maybeSingle();

    if (bookingErr) {
      return NextResponse.json({ error: bookingErr.message }, { status: 500 });
    }
    if (!booking) {
      return NextResponse.json({ found: false }, { status: 404 });
    }

    // 2) Kursdaten separat holen (optional, nur für Anzeige)
    let title: string | null = null;
    let location: string | null = null;

    if (booking.course_id) {
      const { data: course } = await supabase
        .from("courses_lite")
        .select("title, location")
        .eq("id", booking.course_id)
        .maybeSingle();

      title = course?.title ?? null;
      location = course?.location ?? null;
    }

    // 3) Nur paid darf eingecheckt werden
    if (booking.status !== "paid") {
      return NextResponse.json({
        found: true,
        ok: false,
        reason: "not_paid",
        status: booking.status,
        checkedInAt: booking.checked_in_at,
        title,
        location,
      });
    }

    // 4) Schon eingecheckt? -> idempotent
    if (booking.checked_in_at) {
      return NextResponse.json({
        found: true,
        ok: true,
        alreadyCheckedIn: true,
        checkedInAt: booking.checked_in_at,
        status: booking.status,
        title,
        location,
      });
    }

    // 5) Check-in setzen
    const now = new Date().toISOString();

    const { data: updated, error: updErr } = await supabase
      .from("bookings")
      .update({ checked_in_at: now })
      .eq("id", booking.id)
      .select("checked_in_at")
      .single();

    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    return NextResponse.json({
      found: true,
      ok: true,
      alreadyCheckedIn: false,
      checkedInAt: updated.checked_in_at,
      status: booking.status,
      title,
      location,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Serverfehler" }, { status: 500 });
  }
}
