"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type PublishMode = "published" | "draft";

export async function setCoursePublishStateAction(formData: FormData) {
  const courseId = String(formData.get("course_id") || "").trim();
  const mode = String(formData.get("mode") || "").trim() as PublishMode;
  const redirectTo = String(formData.get("redirect_to") || "").trim();
  const targetPath = redirectTo || `/dashboard/courses/${courseId}`;

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
      redirect(targetPath);
    }
  }

  const { error } = await supabase
    .from("courses")
    .update({ is_published: publish })
    .eq("id", courseId)
    .eq("teacher_id", user.id);

  if (error) {
    redirect(targetPath);
  }

  redirect(`${targetPath}${targetPath.includes("?") ? "&" : "?"}saved=${publish ? "published" : "draft"}`);
}
