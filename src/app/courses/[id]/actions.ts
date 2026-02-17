"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Kostenlose Probestunde reservieren (nur für Kurse)
 */
export async function reserveTrial(courseId: string) {
  const supabase = await createSupabaseServerClient();

  // eingeloggten User holen
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Kurs laden
  const { data: course, error: courseError } = await supabase
    .from("courses")
    .select("*")
    .eq("id", courseId)
    .single();

  if (courseError || !course) {
    throw new Error("Kurs nicht gefunden.");
  }

  if (course.type !== "course") {
    throw new Error("Probestunde nur bei Kursen möglich.");
  }

  if (course.spots <= 0) {
    throw new Error("Keine Plätze mehr frei.");
  }

  // Prüfen ob bereits reserviert
  const { data: existing } = await supabase
    .from("trial_reservations")
    .select("*")
    .eq("course_id", courseId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    return;
  }

  // Reservierung anlegen
  const { error: insertError } = await supabase
    .from("trial_reservations")
    .insert({
      course_id: courseId,
      user_id: user.id,
      status: "reserved",
      created_at: new Date().toISOString(),
    });

  if (insertError) {
    throw new Error("Reservierung fehlgeschlagen.");
  }

  // Platz reduzieren
  const { error: updateError } = await supabase
    .from("courses")
    .update({
      spots: course.spots - 1,
    })
    .eq("id", courseId);

  if (updateError) {
    throw new Error("Platz konnte nicht reduziert werden.");
  }

  // Seiten neu laden
  revalidatePath("/courses");
  revalidatePath("/dashboard");
}
