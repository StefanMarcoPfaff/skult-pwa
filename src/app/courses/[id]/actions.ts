// src/app/courses/[id]/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";

export type ReserveResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

const ATTENDEE_KEY = "demo-user"; // später ersetzen wir das mit echtem Login/User

export async function reserveSeat(courseId: string): Promise<ReserveResult> {
  const supabase = await createClient();

  // 1) Kurs holen
  const { data: course, error: courseErr } = await supabase
    .from("courses_lite")
    .select("id, capacity, seats_taken")
    .eq("id", courseId)
    .single();

  if (courseErr || !course) {
    return { ok: false, message: "Kurs nicht gefunden." };
  }

  if (course.seats_taken >= course.capacity) {
    return { ok: false, message: "Ausgebucht." };
  }

  // 2) Schon reserviert?
  const { data: existing, error: existingErr } = await supabase
    .from("bookings")
    .select("id")
    .eq("course_id", courseId)
    .eq("attendee_key", ATTENDEE_KEY)
    .maybeSingle();

  if (existingErr) {
    return { ok: false, message: existingErr.message };
  }

  if (existing) {
    return { ok: false, message: "Du hast bereits reserviert." };
  }

  // 3) Booking anlegen
  const { error: insertErr } = await supabase.from("bookings").insert({
    course_id: courseId,
    attendee_key: ATTENDEE_KEY,
    status: "reserved",
  });

  if (insertErr) {
    return { ok: false, message: insertErr.message };
  }

  // 4) seats_taken hochzählen (optimistisches Locking)
  const { error: updateErr } = await supabase
    .from("courses_lite")
    .update({ seats_taken: course.seats_taken + 1 })
    .eq("id", courseId)
    .eq("seats_taken", course.seats_taken);

  if (updateErr) {
    // Wenn Update schiefgeht, lassen wir das Booking stehen (für Demo ok).
    // Später können wir hier "rollback" bauen.
    return { ok: false, message: updateErr.message };
  }

  revalidatePath(`/courses/${courseId}`);
  revalidatePath("/courses");

  return { ok: true, message: "Reserviert! ✅" };
}

export async function cancelSeat(courseId: string): Promise<ReserveResult> {
  const supabase = await createClient();

  // 1) Booking finden
  const { data: booking, error: bookingErr } = await supabase
    .from("bookings")
    .select("id")
    .eq("course_id", courseId)
    .eq("attendee_key", ATTENDEE_KEY)
    .maybeSingle();

  if (bookingErr) return { ok: false, message: bookingErr.message };
  if (!booking) return { ok: false, message: "Keine Reservierung gefunden." };

  // 2) Booking löschen
  const { error: delErr } = await supabase
    .from("bookings")
    .delete()
    .eq("id", booking.id);

  if (delErr) return { ok: false, message: delErr.message };

  // 3) seats_taken runterzählen (einfach & robust für Demo)
  const { data: course, error: courseErr } = await supabase
    .from("courses_lite")
    .select("seats_taken")
    .eq("id", courseId)
    .single();

  if (!courseErr && course) {
    const next = Math.max(0, (course.seats_taken ?? 0) - 1);
    await supabase.from("courses_lite").update({ seats_taken: next }).eq("id", courseId);
  }

  revalidatePath(`/courses/${courseId}`);
  revalidatePath("/courses");

  return { ok: true, message: "Reservierung storniert." };
}
