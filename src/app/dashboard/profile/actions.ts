"use server";

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { validateProfileImageFile } from "@/lib/profile-image-upload";
import { isProviderType } from "@/lib/provider-profiles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SaveProfileState = {
  success?: string;
  warning?: string;
  error?: string;
  redirectTo?: string;
};

function optionalText(value: FormDataEntryValue | null): string | null {
  if (value === null) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

function logProfileSaveEvent(
  kind: "validation_error" | "upload_error" | "url_error" | "save_error" | "save_warning",
  payload: Record<string, unknown>
) {
  console.error("[profile-save]", {
    kind,
    ...payload,
  });
}

export async function saveProfileAction(formData: FormData): Promise<SaveProfileState> {
  const PROFILE_IMAGES_BUCKET = "profile-images";

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        error: "Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.",
        redirectTo: "/login",
      };
    }

    const first_name = optionalText(formData.get("first_name"));
    const last_name = optionalText(formData.get("last_name"));
    const bio = optionalText(formData.get("bio"));
    const intro_video_url = optionalText(formData.get("intro_video_url"));
    const existing_photo_url = optionalText(formData.get("existing_photo_url"));
    const photo_file = formData.get("photo_file");
    const provider_type_raw = optionalText(formData.get("provider_type")) ?? "independent_teacher";
    const organization_name = optionalText(formData.get("organization_name"));

    if (!isProviderType(provider_type_raw)) {
      logProfileSaveEvent("validation_error", {
        context: "provider_type",
        userId: user.id,
      });
      return { error: "Bitte waehle einen gueltigen Anbietertyp." };
    }

    if (!first_name) return { error: "Vorname ist erforderlich." };
    if (!last_name) return { error: "Nachname ist erforderlich." };
    if (provider_type_raw === "studio_provider" && !organization_name) {
      return { error: "Ein Organisationsname ist fuer Organisationen erforderlich." };
    }
    if (intro_video_url && !/^https?:\/\//i.test(intro_video_url)) {
      return { error: "Bitte gib einen gueltigen Video-Link mit http:// oder https:// an." };
    }

    let photo_url = existing_photo_url;
    let warning: string | undefined;

    if (photo_file instanceof File && photo_file.size > 0) {
      const validation = validateProfileImageFile({
        size: photo_file.size,
        type: photo_file.type,
        name: photo_file.name,
      });

      if (!validation.ok) {
        logProfileSaveEvent("validation_error", {
          context: "photo_file",
          userId: user.id,
          reason: validation.reason,
          fileSize: photo_file.size,
          mimeType: photo_file.type || null,
        });
        return { error: validation.error };
      }

      const objectPath = `${user.id}/profile-photo-${Date.now()}.${validation.normalizedExtension}`;

      try {
        const storageAdmin = createSupabaseAdmin();
        const { error: uploadError } = await storageAdmin.storage
          .from(PROFILE_IMAGES_BUCKET)
          .upload(objectPath, photo_file, {
            contentType: photo_file.type,
            upsert: true,
          });

        if (uploadError) {
          logProfileSaveEvent("upload_error", {
            context: "storage.upload",
            userId: user.id,
            bucket: PROFILE_IMAGES_BUCKET,
            objectPath,
            message: uploadError.message,
          });
          warning = "Das Profil konnte gespeichert werden, aber das Profilbild konnte nicht hochgeladen werden.";
        } else {
          const { data: publicUrlData } = storageAdmin.storage
            .from(PROFILE_IMAGES_BUCKET)
            .getPublicUrl(objectPath);

          const publicUrl = optionalText(publicUrlData?.publicUrl ?? null);
          if (!publicUrl) {
            logProfileSaveEvent("url_error", {
              context: "storage.public_url",
              userId: user.id,
              bucket: PROFILE_IMAGES_BUCKET,
              objectPath,
            });
            warning =
              "Das Profil konnte gespeichert werden, aber das Profilbild konnte nicht hochgeladen werden.";
          } else {
            photo_url = publicUrl;
          }
        }
      } catch (error: unknown) {
        logProfileSaveEvent("upload_error", {
          context: "storage.upload.exception",
          userId: user.id,
          bucket: PROFILE_IMAGES_BUCKET,
          message: error instanceof Error ? error.message : String(error),
        });
        warning = "Beim Hochladen des Profilbilds ist ein Fehler aufgetreten. Bitte versuche es erneut.";
      }
    }

    const { error } = await supabase.from("profiles").upsert(
      {
        id: user.id,
        first_name,
        last_name,
        bio,
        photo_url,
        intro_video_url,
        provider_type: provider_type_raw,
        organization_name: provider_type_raw === "studio_provider" ? organization_name : null,
      },
      { onConflict: "id" }
    );

    if (error) {
      logProfileSaveEvent("save_error", {
        context: "profiles.upsert",
        userId: user.id,
        message: error.message,
      });
      return { error: error.message || "Profil konnte nicht gespeichert werden." };
    }

    if (warning) {
      logProfileSaveEvent("save_warning", {
        context: "profile.saved.with_upload_warning",
        userId: user.id,
      });
      return {
        success: "Profil gespeichert.",
        warning,
      };
    }

    return {
      success: "Profil gespeichert.",
      redirectTo: "/dashboard?profileSaved=1",
    };
  } catch (error: unknown) {
    logProfileSaveEvent("save_error", {
      context: "save_profile_action.exception",
      message: error instanceof Error ? error.message : String(error),
    });
    return { error: "Beim Speichern des Profils ist ein Fehler aufgetreten. Bitte versuche es erneut." };
  }
}
