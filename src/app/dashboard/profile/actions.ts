"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SaveProfileState = {
  success?: string;
  error?: string;
};

function optionalText(value: FormDataEntryValue | null): string | null {
  if (value === null) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

export async function saveProfileAction(formData: FormData): Promise<SaveProfileState> {
  const PROFILE_IMAGES_BUCKET = "profile-images";
  const MAX_PROFILE_IMAGE_SIZE = 5 * 1024 * 1024;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const first_name = optionalText(formData.get("first_name"));
  const last_name = optionalText(formData.get("last_name"));
  const bio = optionalText(formData.get("bio"));
  const intro_video_url = optionalText(formData.get("intro_video_url"));
  const existing_photo_url = optionalText(formData.get("existing_photo_url"));
  const photo_file = formData.get("photo_file");

  if (!first_name) return { error: "Vorname ist erforderlich." };
  if (!last_name) return { error: "Nachname ist erforderlich." };
  if (intro_video_url && !/^https?:\/\//i.test(intro_video_url)) {
    return { error: "Bitte gib einen gültigen Video-Link mit http:// oder https:// an." };
  }

  let photo_url = existing_photo_url;
  if (photo_file instanceof File && photo_file.size > 0) {
    if (!photo_file.type.startsWith("image/")) {
      return { error: "Bitte lade ein Bild im JPG-, PNG- oder WebP-Format hoch." };
    }
    if (photo_file.size > MAX_PROFILE_IMAGE_SIZE) {
      return { error: "Das Profilfoto ist zu groß (max. 5 MB)." };
    }

    const extensionFromName = photo_file.name.includes(".")
      ? photo_file.name.split(".").pop()?.toLowerCase()
      : "";
    const extension = extensionFromName || photo_file.type.split("/").pop() || "jpg";
    const objectPath = `${user.id}/profile-photo-${Date.now()}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from(PROFILE_IMAGES_BUCKET)
      .upload(objectPath, photo_file, {
        contentType: photo_file.type,
        upsert: false,
      });

    if (uploadError) {
      const uploadMessage = String(uploadError.message || "");
      if (/bucket not found/i.test(uploadMessage)) {
        return { error: "Storage-Bucket 'profile-images' fehlt. Bitte in Supabase anlegen." };
      }
      return { error: `Profilfoto konnte nicht hochgeladen werden: ${uploadError.message}` };
    }

    const { data: publicUrlData } = supabase.storage
      .from(PROFILE_IMAGES_BUCKET)
      .getPublicUrl(objectPath);
    photo_url = publicUrlData.publicUrl;
  }

  const { error } = await supabase.from("profiles").upsert(
    {
      id: user.id,
      first_name,
      last_name,
      bio,
      photo_url,
      intro_video_url,
    },
    { onConflict: "id" }
  );

  if (error) {
    return { error: error.message || "Profil konnte nicht gespeichert werden." };
  }

  redirect("/dashboard?profileSaved=1");
}
