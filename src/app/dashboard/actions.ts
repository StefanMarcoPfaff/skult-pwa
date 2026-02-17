"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function setPublishedAction(courseId: string, publish: boolean) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();

  if (!data.user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("courses")
    .update({ is_published: publish })
    .eq("id", courseId);

  if (error) throw new Error(error.message);
}
