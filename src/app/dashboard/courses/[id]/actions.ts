"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type PublishMode = "published" | "draft";

export async function setCoursePublishStateAction(formData: FormData) {
  const courseId = String(formData.get("course_id") || "").trim();
  const mode = String(formData.get("mode") || "").trim() as PublishMode;

  if (!courseId || (mode !== "published" && mode !== "draft")) {
    redirect("/dashboard");
  }

  const publish = mode === "published";
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  if (!publish) {
    const { count } = await supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("course_id", courseId);

    if ((count ?? 0) > 0) {
      redirect(`/dashboard/courses/${courseId}`);
    }
  }

  const { error } = await supabase
    .from("courses")
    .update({ is_published: publish })
    .eq("id", courseId)
    .eq("teacher_id", user.id);

  if (error) {
    redirect(`/dashboard/courses/${courseId}`);
  }

  redirect(`/dashboard/courses/${courseId}?saved=${publish ? "published" : "draft"}`);
}
