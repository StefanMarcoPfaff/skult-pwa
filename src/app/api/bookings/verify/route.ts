import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

export async function GET(req: Request) {
  const url = new URL(req.url);
  const attendeeKey = url.searchParams.get("attendeeKey");

  if (!attendeeKey) {
    return NextResponse.json({ error: "missing attendeeKey" }, { status: 400 });
  }

  const { data: booking, error } = await supabase
    .from("bookings")
    .select("status,checked_in_at,course_id")
    .eq("attendee_key", attendeeKey)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!booking) return NextResponse.json({ found: false, status: null, checkedInAt: null });

  let course: any = null;
  if (booking.course_id) {
    const { data } = await supabase
      .from("courses_lite")
      .select("title,location")
      .eq("id", booking.course_id)
      .maybeSingle();
    course = data;
  }

  return NextResponse.json({
    found: true,
    status: booking.status ?? null,
    checkedInAt: booking.checked_in_at ?? null,
    title: course?.title ?? null,
    location: course?.location ?? null,
  });
}
