"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";

export async function reserveSeat(courseId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("courses_lite")
    .select("capacity,seats_taken")
    .eq("id", courseId)
    .single();

  if (error || !data) {
    throw new Error("Kurs nicht gefunden");
  }

  if (data.seats_taken >= data.capacity) {
    throw new Error("Ausgebucht");
  }

  const { error: updateError } = await supabase
    .from("courses_lite")
    .update({ seats_taken: data.seats_taken + 1 })
    .eq("id", courseId)
    .eq("seats_taken", data.seats_taken);

  if (updateError) {
    throw new Error(updateError.message);
  }

  revalidatePath(`/courses/${courseId}`);
  revalidatePath("/courses");
}
