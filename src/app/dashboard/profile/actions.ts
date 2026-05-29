"use server";

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  isProviderBillingPayoutMethod,
  isProviderBillingVatStatus,
} from "@/lib/provider-billing-profile";
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
    const existing_company_logo_url = optionalText(formData.get("existing_company_logo_url"));
    const photo_file = formData.get("photo_file");
    const company_logo_file = formData.get("company_logo_file");
    const provider_type_raw = optionalText(formData.get("provider_type")) ?? "independent_teacher";
    const organization_name = optionalText(formData.get("organization_name"));
    const payout_method_raw = optionalText(formData.get("payout_method")) ?? "iban";
    const billing_name = optionalText(formData.get("billing_name"));
    const billing_company_name = optionalText(formData.get("billing_company_name"));
    const billing_address_line_1 = optionalText(formData.get("billing_address_line_1"));
    const billing_address_line_2 = optionalText(formData.get("billing_address_line_2"));
    const billing_postal_code = optionalText(formData.get("billing_postal_code"));
    const billing_city = optionalText(formData.get("billing_city"));
    const billing_country = optionalText(formData.get("billing_country"));
    const tax_number = optionalText(formData.get("tax_number"));
    const vat_id = optionalText(formData.get("vat_id"));
    const vat_status_raw = optionalText(formData.get("vat_status"));
    const payout_iban_input = optionalText(formData.get("payout_iban"));
    const payout_paypal_email_input = optionalText(formData.get("payout_paypal_email"));
    const payout_iban = payout_method_raw === "iban" ? payout_iban_input?.replace(/\s+/g, "").toUpperCase() ?? null : null;
    const payout_paypal_email =
      payout_method_raw === "paypal" ? payout_paypal_email_input?.toLowerCase() ?? null : null;

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
    if (!isProviderBillingPayoutMethod(payout_method_raw)) {
      logProfileSaveEvent("validation_error", {
        context: "payout_method",
        userId: user.id,
        payoutMethod: payout_method_raw,
      });
      return { error: "Bitte waehle aus, wie du Auszahlungen erhalten moechtest." };
    }
    if (vat_status_raw && !isProviderBillingVatStatus(vat_status_raw)) {
      logProfileSaveEvent("validation_error", {
        context: "vat_status",
        userId: user.id,
        vatStatus: vat_status_raw,
      });
      return { error: "Bitte waehle einen gueltigen Umsatzsteuerstatus." };
    }
    if (intro_video_url && !/^https?:\/\//i.test(intro_video_url)) {
      return { error: "Bitte gib einen gueltigen Video-Link mit http:// oder https:// an." };
    }

    let photo_url = existing_photo_url;
    let company_logo_url = existing_company_logo_url;
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

    if (provider_type_raw === "studio_provider" && company_logo_file instanceof File && company_logo_file.size > 0) {
      const validation = validateProfileImageFile({
        size: company_logo_file.size,
        type: company_logo_file.type,
        name: company_logo_file.name,
      });

      if (!validation.ok) {
        logProfileSaveEvent("validation_error", {
          context: "company_logo_file",
          userId: user.id,
          reason: validation.reason,
          fileSize: company_logo_file.size,
          mimeType: company_logo_file.type || null,
        });
        return { error: validation.error };
      }

      const objectPath = `${user.id}/company-logo-${Date.now()}.${validation.normalizedExtension}`;

      try {
        const storageAdmin = createSupabaseAdmin();
        const { error: uploadError } = await storageAdmin.storage
          .from(PROFILE_IMAGES_BUCKET)
          .upload(objectPath, company_logo_file, {
            contentType: company_logo_file.type,
            upsert: true,
          });

        if (uploadError) {
          logProfileSaveEvent("upload_error", {
            context: "storage.upload.company_logo",
            userId: user.id,
            bucket: PROFILE_IMAGES_BUCKET,
            objectPath,
            message: uploadError.message,
          });
          warning = "Das Profil konnte gespeichert werden, aber das Firmenlogo konnte nicht hochgeladen werden.";
        } else {
          const { data: publicUrlData } = storageAdmin.storage
            .from(PROFILE_IMAGES_BUCKET)
            .getPublicUrl(objectPath);

          const publicUrl = optionalText(publicUrlData?.publicUrl ?? null);
          if (!publicUrl) {
            logProfileSaveEvent("url_error", {
              context: "storage.public_url.company_logo",
              userId: user.id,
              bucket: PROFILE_IMAGES_BUCKET,
              objectPath,
            });
            warning = "Das Profil konnte gespeichert werden, aber das Firmenlogo konnte nicht hochgeladen werden.";
          } else {
            company_logo_url = publicUrl;
          }
        }
      } catch (error: unknown) {
        logProfileSaveEvent("upload_error", {
          context: "storage.upload.company_logo.exception",
          userId: user.id,
          bucket: PROFILE_IMAGES_BUCKET,
          message: error instanceof Error ? error.message : String(error),
        });
        warning = "Beim Hochladen des Firmenlogos ist ein Fehler aufgetreten. Bitte versuche es erneut.";
      }
    }

    const { error } = await supabase.from("profiles").upsert(
      {
        id: user.id,
        first_name,
        last_name,
        bio,
        photo_url,
        company_logo_url: provider_type_raw === "studio_provider" ? company_logo_url : existing_company_logo_url,
        intro_video_url,
        provider_type: provider_type_raw,
        organization_name: provider_type_raw === "studio_provider" ? organization_name : null,
        payout_method: payout_method_raw,
        billing_name,
        billing_company_name,
        billing_address_line_1,
        billing_address_line_2,
        billing_postal_code,
        billing_city,
        billing_country,
        tax_number,
        vat_id,
        vat_status: vat_status_raw,
        payout_iban,
        payout_paypal_email,
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
    };
  } catch (error: unknown) {
    logProfileSaveEvent("save_error", {
      context: "save_profile_action.exception",
      message: error instanceof Error ? error.message : String(error),
    });
    return { error: "Beim Speichern des Profils ist ein Fehler aufgetreten. Bitte versuche es erneut." };
  }
}
