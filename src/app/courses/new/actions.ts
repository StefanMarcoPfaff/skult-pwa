"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function createCourseAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) redirect("/login");

  const kind = String(formData.get("kind") || "workshop");
  const title = String(formData.get("title") || "").trim();
  const location = String(formData.get("location") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const capacity = Number(formData.get("capacity") || 10);

  const startsAtRaw = String(formData.get("starts_at") || "").trim();
  // datetime-local liefert "YYYY-MM-DDTHH:mm" ohne Zeitzone → wir speichern als ISO (lokal interpretiert)
  const starts_at = startsAtRaw ? new Date(startsAtRaw).toISOString() : null;

  if (!title) throw new Error("Titel fehlt");

  // V1-Validierung: Workshop braucht starts_at
  if (kind === "workshop" && !starts_at) {
    throw new Error("Workshop braucht ein Startdatum (starts_at).");
  }

  const { error } = await supabase.from("courses").insert({
    teacher_id: userData.user.id,
    kind,
    title,
    location: location || null,
    description: description || null,
    starts_at,
    capacity: Number.isFinite(capacity) ? capacity : 10,
    is_published: false,
  });

  if (error) {
    throw new Error(error.message);
  }

  redirect("/dashboard");
}
