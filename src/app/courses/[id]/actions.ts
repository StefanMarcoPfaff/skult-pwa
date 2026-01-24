"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";

const DEMO_USER = "demo-user"; // später: Supabase Auth user.id

type CourseRow = {
  id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  location: string | null;
  offer_type: "course" | "workshop";
  price_type: "free" | "paid";
  price_cents: number;
  currency: string;
};

type SessionRow = {
  id: string;
  course_id: string;
  starts_at: string;
  ends_at: string | null;
  capacity: number;
  seats_taken: number;
};

export async function reserveCourseSession(courseId: string, sessionId: string) {
  const supabase = await createClient();

  // 1) Session laden
  const { data: session, error: sessErr } = await supabase
    .from("course_sessions")
    .select("id,course_id,capacity,seats_taken,starts_at,ends_at")
    .eq("id", sessionId)
    .single<SessionRow>();

  if (sessErr || !session) throw new Error("Termin nicht gefunden");
  if (session.course_id !== courseId) throw new Error("Termin passt nicht zum Kurs");
  if (session.seats_taken >= session.capacity) throw new Error("Dieser Termin ist ausgebucht");

  // 2) Schon reserviert?
  const { data: existing, error: existErr } = await supabase
    .from("bookings")
    .select("id")
    .eq("course_id", courseId)
    .eq("session_id", sessionId)
    .eq("attendee_key", DEMO_USER)
    .eq("status", "reserved")
    .maybeSingle();

  if (existErr) throw new Error(existErr.message);
  if (existing) throw new Error("Du hast diesen Termin bereits reserviert.");

  // 3) seats_taken hochzählen (optimistisch)
  const { error: updateErr } = await supabase
    .from("course_sessions")
    .update({ seats_taken: session.seats_taken + 1 })
    .eq("id", sessionId)
    .eq("seats_taken", session.seats_taken);

  if (updateErr) throw new Error(updateErr.message);

  // 4) booking schreiben
  const { error: insErr } = await supabase.from("bookings").insert({
    course_id: courseId,
    session_id: sessionId,
    attendee_key: DEMO_USER,
    status: "reserved",
    payment_status: "none",
  });

  if (insErr) throw new Error(insErr.message);

  revalidatePath(`/courses/${courseId}`);
  revalidatePath("/courses");
}

export async function cancelCourseSession(courseId: string, sessionId: string) {
  const supabase = await createClient();

  // Booking finden
  const { data: booking, error: bErr } = await supabase
    .from("bookings")
    .select("id,status")
    .eq("course_id", courseId)
    .eq("session_id", sessionId)
    .eq("attendee_key", DEMO_USER)
    .eq("status", "reserved")
    .maybeSingle();

  if (bErr) throw new Error(bErr.message);
  if (!booking) throw new Error("Keine Reservierung gefunden.");

  // Session laden
  const { data: session, error: sErr } = await supabase
    .from("course_sessions")
    .select("id,seats_taken")
    .eq("id", sessionId)
    .single<Pick<SessionRow, "id" | "seats_taken">>();

  if (sErr || !session) throw new Error("Termin nicht gefunden");

  // Booking löschen
  const { error: delErr } = await supabase.from("bookings").delete().eq("id", booking.id);
  if (delErr) throw new Error(delErr.message);

  // seats_taken runterzählen (nicht unter 0)
  const newTaken = Math.max(0, session.seats_taken - 1);
  const { error: updErr } = await supabase
    .from("course_sessions")
    .update({ seats_taken: newTaken })
    .eq("id", sessionId)
    .eq("seats_taken", session.seats_taken);

  if (updErr) throw new Error(updErr.message);

  revalidatePath(`/courses/${courseId}`);
  revalidatePath("/courses");
}

/**
 * Workshop "Direktkauf" (V1):
 * Wir erstellen eine Buchung mit payment_status='pending'.
 * Nächster Schritt: Stripe Checkout → nach success → payment_status='paid'
 */
export async function buyWorkshop(courseId: string) {
  const supabase = await createClient();

  const { data: course, error: cErr } = await supabase
    .from("courses_lite")
    .select("id,offer_type,price_type,price_cents,currency,title")
    .eq("id", courseId)
    .single<CourseRow>();

  if (cErr || !course) throw new Error("Workshop nicht gefunden");
  if (course.offer_type !== "workshop") throw new Error("Das ist kein Workshop.");
  if (course.price_type !== "paid" || (course.price_cents ?? 0) <= 0) {
    throw new Error("Workshop braucht einen Preis (paid).");
  }

  // (V1) keine doppelte pending/paid Buchung
  const { data: existing, error: existErr } = await supabase
    .from("bookings")
    .select("id,payment_status")
    .eq("course_id", courseId)
    .eq("attendee_key", DEMO_USER)
    .in("payment_status", ["pending", "paid"])
    .maybeSingle();

  if (existErr) throw new Error(existErr.message);
  if (existing) throw new Error("Du hast diesen Workshop bereits gestartet/gekauft.");

  const { error: insErr } = await supabase.from("bookings").insert({
    course_id: courseId,
    attendee_key: DEMO_USER,
    status: "reserved",
    payment_status: "pending",
  });

  if (insErr) throw new Error(insErr.message);

  revalidatePath(`/courses/${courseId}`);
  revalidatePath("/courses");
}
