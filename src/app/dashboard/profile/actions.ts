"use server";

import { headers } from "next/headers";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getProviderBillingProfile,
  getProviderCustomConnectReadiness,
  isProviderBillingVatStatus,
} from "@/lib/provider-billing-profile";
import {
  getIbanLast4,
  isValidIban,
  normalizeIban,
  PROVIDER_PAYOUT_PROFILE_PROVIDER,
} from "@/lib/payout-profile";
import { validateProfileImageFile } from "@/lib/profile-image-upload";
import { isProviderType } from "@/lib/provider-profiles";
import { createOrUpdateCustomAccountForProvider } from "@/lib/stripe/custom-connect";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SaveProfileState = {
  success?: string;
  warning?: string;
  error?: string;
  redirectTo?: string;
  debug?: UnifiedProfileSaveDebug;
};

type SavedPayoutProfileDebug = {
  id: string;
  teacher_id: string | null;
  provider: string | null;
  created_at: string | null;
  updated_at: string | null;
  provider_account_id: string | null;
  stripe_account_type: string | null;
  stripe_last_sync_at: string | null;
  payout_method: string | null;
  legal_entity_type: string | null;
  business_type: string | null;
  representative_first_name: string | null;
  representative_last_name: string | null;
  representative_birth_date: string | null;
  representative_email: string | null;
  representative_phone: string | null;
  legal_address_line1: string | null;
  legal_address_line2: string | null;
  legal_postal_code: string | null;
  legal_city: string | null;
  legal_country: string | null;
  stripe_terms_accepted_at: string | null;
  stripe_terms_accepted_ip: string | null;
  stripe_terms_accepted_user_agent: string | null;
  business_profile_url: string | null;
  business_profile_mcc: string | null;
  business_profile_product_description: string | null;
};

type ExistingPayoutProfile = {
  id: string;
  teacher_id: string | null;
  provider: string | null;
  created_at: string | null;
  updated_at: string | null;
  payout_method: string | null;
  iban_last4: string | null;
  paypal_email: string | null;
  address: string | null;
  data_transfer_consent_accepted_at: string | null;
  stripe_terms_accepted_at: string | null;
  stripe_terms_accepted_ip: string | null;
  stripe_terms_accepted_user_agent: string | null;
};

export type UnifiedProfileSaveDebug = {
  formDataKeys: string[];
  received: {
    userId: string;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    representative_birth_date: string | null;
    organization_name: string | null;
    business_profile_url: string | null;
    business_profile_product_description: string | null;
    legal_entity_type: string | null;
    data_transfer_consent: string | null;
    stripe_terms_accepted: string | null;
    consentAccepted: boolean;
    payout_method: string;
    billing_address_line_1: string | null;
    billing_postal_code: string | null;
    billing_city: string | null;
    billing_country: string | null;
  };
  existingRows: Array<{
    id: string;
    teacher_id: string | null;
    provider: string | null;
    created_at: string | null;
    updated_at: string | null;
  }>;
  savedRows: Array<{
    id: string;
    teacher_id: string | null;
    provider: string | null;
    created_at: string | null;
    updated_at: string | null;
  }>;
  verifyRow: SavedPayoutProfileDebug | null;
  verifyFailures: string[];
};

function optionalText(value: FormDataEntryValue | null): string | null {
  if (value === null) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

function optionalFormText(formData: FormData, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = optionalText(formData.get(key));
    if (value) return value;
  }

  return null;
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

function getErrorProperty(error: unknown, key: string): unknown {
  return typeof error === "object" && error !== null && key in error
    ? (error as Record<string, unknown>)[key]
    : null;
}

function getStripeErrorLogPayload(error: unknown): Record<string, unknown> {
  return {
    stripeErrorType: getErrorProperty(error, "type"),
    stripeErrorCode: getErrorProperty(error, "code"),
    stripeRequestId: getErrorProperty(error, "requestId"),
    stripeStatusCode: getErrorProperty(error, "statusCode"),
    message: error instanceof Error ? error.message : String(error),
  };
}

function buildBillingAddress(input: {
  billing_address_line_1: string | null;
  billing_address_line_2: string | null;
  billing_postal_code: string | null;
  billing_city: string | null;
  billing_country: string | null;
}): string | null {
  const cityLine = [input.billing_postal_code, input.billing_city].filter(Boolean).join(" ").trim() || null;
  const lines = [
    input.billing_address_line_1,
    input.billing_address_line_2,
    cityLine,
    input.billing_country,
  ].filter((value): value is string => Boolean(value));

  return lines.length > 0 ? lines.join("\n") : null;
}

function getClientIp(requestHeaders: Headers): string | null {
  const forwardedFor = optionalText(requestHeaders.get("x-forwarded-for"));
  if (forwardedFor) return forwardedFor.split(",")[0]?.trim() || null;
  return optionalText(requestHeaders.get("x-real-ip"));
}

function normalizeDateInput(value: string | null): string | null {
  if (!value) return null;
  const isoDate = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoDate) return `${isoDate[1]}-${isoDate[2]}-${isoDate[3]}`;

  const germanDate = value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (germanDate) return `${germanDate[3]}-${germanDate[2]}-${germanDate[1]}`;

  return value;
}

function logProfilePayoutDebug(
  kind: string,
  payload: Record<string, unknown>
) {
  console.info("[profile-payout-debug]", {
    kind,
    ...payload,
  });
}

function getCustomConnectAutoPrepareBlockers(input: {
  providerPayoutProfileId: string | null;
  providerAccountIdBefore: string | null;
  isReadyForCustomAccountCreation: boolean;
  missingFields: string[];
}): string[] {
  const blockers: string[] = [];

  if (!input.providerPayoutProfileId) {
    blockers.push("provider_payout_profile_id_missing");
  }

  if (!input.providerAccountIdBefore && !input.isReadyForCustomAccountCreation) {
    blockers.push("custom_connect_not_ready");
  }

  if (input.missingFields.length > 0) {
    blockers.push("missing_fields_present");
  }

  return blockers;
}

function datesMatch(actual: string | null | undefined, expected: string | null): boolean {
  if (!expected) return true;
  return Boolean(actual?.startsWith(expected));
}

function verifySavedPayoutProfile(input: {
  row: SavedPayoutProfileDebug | null;
  userId: string;
  payout_method: string;
  legal_entity_type: string | null;
  representative_birth_date: string | null;
  representative_email: string | null;
  legal_address_line1: string | null;
  legal_postal_code: string | null;
  legal_city: string | null;
  legal_country: string | null;
  business_profile_url: string | null;
  business_profile_product_description: string | null;
  consentAccepted: boolean;
}): string[] {
  const row = input.row;
  const failures: string[] = [];

  if (!row) return ["provider_payout_profiles row wurde nach dem Speichern nicht gefunden"];
  if (row.teacher_id !== input.userId) failures.push("teacher_id stimmt nicht");
  if (row.provider !== PROVIDER_PAYOUT_PROFILE_PROVIDER) failures.push("provider stimmt nicht");
  if (row.payout_method !== input.payout_method) failures.push("payout_method wurde nicht gespeichert");
  if (row.legal_entity_type !== input.legal_entity_type) failures.push("legal_entity_type wurde nicht gespeichert");
  if (!datesMatch(row.representative_birth_date, input.representative_birth_date)) {
    failures.push("representative_birth_date wurde nicht gespeichert");
  }
  if (row.representative_email !== input.representative_email) {
    failures.push("representative_email wurde nicht gespeichert");
  }
  if (row.legal_address_line1 !== input.legal_address_line1) {
    failures.push("legal_address_line1 wurde nicht gespeichert");
  }
  if (row.legal_postal_code !== input.legal_postal_code) {
    failures.push("legal_postal_code wurde nicht gespeichert");
  }
  if (row.legal_city !== input.legal_city) failures.push("legal_city wurde nicht gespeichert");
  if (row.legal_country !== input.legal_country) failures.push("legal_country wurde nicht gespeichert");
  if (row.business_profile_url !== input.business_profile_url) {
    failures.push("business_profile_url wurde nicht gespeichert");
  }
  if (row.business_profile_product_description !== input.business_profile_product_description) {
    failures.push("business_profile_product_description wurde nicht gespeichert");
  }
  if (input.consentAccepted && !row.stripe_terms_accepted_at) {
    failures.push("stripe_terms_accepted_at wurde nicht gespeichert");
  }

  return failures;
}

function buildSaveDebug(input: {
  formDataKeys: string[];
  userId: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  representative_birth_date: string | null;
  organization_name: string | null;
  business_profile_url: string | null;
  business_profile_product_description: string | null;
  legal_entity_type: string | null;
  data_transfer_consent: FormDataEntryValue | null;
  stripe_terms_accepted: FormDataEntryValue | null;
  consentAccepted: boolean;
  payout_method: string;
  billing_address_line_1: string | null;
  billing_postal_code: string | null;
  billing_city: string | null;
  billing_country: string | null;
  existingRows: ExistingPayoutProfile[] | null | undefined;
  savedRows: SavedPayoutProfileDebug[] | null | undefined;
  verifyRow: SavedPayoutProfileDebug | null;
  verifyFailures: string[];
}): UnifiedProfileSaveDebug {
  return {
    formDataKeys: input.formDataKeys,
    received: {
      userId: input.userId,
      first_name: input.first_name,
      last_name: input.last_name,
      phone: input.phone,
      representative_birth_date: input.representative_birth_date,
      organization_name: input.organization_name,
      business_profile_url: input.business_profile_url,
      business_profile_product_description: input.business_profile_product_description,
      legal_entity_type: input.legal_entity_type,
      data_transfer_consent: input.data_transfer_consent ? String(input.data_transfer_consent) : null,
      stripe_terms_accepted: input.stripe_terms_accepted ? String(input.stripe_terms_accepted) : null,
      consentAccepted: input.consentAccepted,
      payout_method: input.payout_method,
      billing_address_line_1: input.billing_address_line_1,
      billing_postal_code: input.billing_postal_code,
      billing_city: input.billing_city,
      billing_country: input.billing_country,
    },
    existingRows: (input.existingRows ?? []).map((row) => ({
      id: row.id,
      teacher_id: row.teacher_id,
      provider: row.provider,
      created_at: row.created_at,
      updated_at: row.updated_at,
    })),
    savedRows: (input.savedRows ?? []).map((row) => ({
      id: row.id,
      teacher_id: row.teacher_id,
      provider: row.provider,
      created_at: row.created_at,
      updated_at: row.updated_at,
    })),
    verifyRow: input.verifyRow,
    verifyFailures: input.verifyFailures,
  };
}

export async function saveUnifiedProviderProfile(formData: FormData): Promise<SaveProfileState> {
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
    const phone = optionalText(formData.get("phone"));
    const payout_method_raw = "iban";
    const account_holder_name = optionalText(formData.get("account_holder_name"));
    const billing_name = [first_name, last_name].filter(Boolean).join(" ").trim() || null;
    const billing_company_name = organization_name;
    const formDataKeys = Array.from(new Set(Array.from(formData.keys()))).sort();
    const billing_address_line_1 = optionalFormText(formData, "billing_address_line_1", "billing_address_line1");
    const billing_address_line_2 = optionalFormText(formData, "billing_address_line_2", "billing_address_line2");
    const billing_postal_code = optionalText(formData.get("billing_postal_code"));
    const billing_city = optionalText(formData.get("billing_city"));
    const billing_country = optionalText(formData.get("billing_country"));
    const tax_number = optionalText(formData.get("tax_number"));
    const vat_id = optionalText(formData.get("vat_id"));
    const vat_status_raw = optionalText(formData.get("vat_status"));
    const payout_iban_input = optionalText(formData.get("payout_iban"));
    const legal_entity_type = optionalText(formData.get("legal_entity_type"));
    const representative_birth_date = normalizeDateInput(optionalText(formData.get("representative_birth_date")));
    const business_profile_url = optionalText(formData.get("business_profile_url"));
    const business_profile_mcc = optionalText(formData.get("business_profile_mcc"));
    const business_profile_product_description = optionalText(formData.get("business_profile_product_description"));
    const consentAccepted =
      formData.get("data_transfer_consent") === "on" ||
      formData.get("stripe_terms_accepted") === "on";
    const requestHeaders = await headers();
    const clientIp = getClientIp(requestHeaders);
    const userAgent = optionalText(requestHeaders.get("user-agent"));
    const payout_iban = normalizeIban(payout_iban_input);
    const representative_first_name = first_name;
    const representative_last_name = last_name;
    const representative_email = user.email ?? null;
    const representative_phone = phone;
    const legal_address_line1 = billing_address_line_1;
    const legal_address_line2 = billing_address_line_2;
    const legal_postal_code = billing_postal_code;
    const legal_city = billing_city;
    const legal_country = billing_country;

    logProfilePayoutDebug("form_received", {
      userId: user.id,
      formDataKeys,
      first_name,
      last_name,
      phone,
      organization_name,
      legal_entity_type,
      representative_birth_date,
      birth_date: representative_birth_date,
      business_profile_url,
      profile_url: business_profile_url,
      business_profile_product_description,
      product_description: business_profile_product_description,
      data_transfer_consent: formData.get("data_transfer_consent"),
      stripe_terms_accepted: formData.get("stripe_terms_accepted"),
      consentAccepted,
      payout_method: payout_method_raw,
      payout_iban_present: Boolean(payout_iban_input),
      account_holder_name_present: Boolean(account_holder_name),
      billing_address_line_1,
      billing_address_line1: optionalText(formData.get("billing_address_line1")),
      billing_address_line_1_present: Boolean(billing_address_line_1),
      billing_postal_code,
      billing_city,
      billing_country,
      phone_present: Boolean(phone),
    });

    if (!isProviderType(provider_type_raw)) {
      logProfileSaveEvent("validation_error", {
        context: "provider_type",
        userId: user.id,
      });
      return { error: "Bitte wähle einen gültigen Anbietertyp." };
    }

    if (!first_name) return { error: "Vorname ist erforderlich." };
    if (!last_name) return { error: "Nachname ist erforderlich." };
    if (!account_holder_name) return { error: "Kontoinhaber*in ist erforderlich." };
    if (vat_status_raw && !isProviderBillingVatStatus(vat_status_raw)) {
      logProfileSaveEvent("validation_error", {
        context: "vat_status",
        userId: user.id,
        vatStatus: vat_status_raw,
      });
      return { error: "Bitte wähle einen gültigen Umsatzsteuerstatus." };
    }
    if (legal_entity_type && !["individual", "company", "nonprofit"].includes(legal_entity_type)) {
      return { error: "Bitte wähle eine gültige Rechtsform." };
    }
    if (intro_video_url && !/^https?:\/\//i.test(intro_video_url)) {
      return { error: "Bitte gib einen gültigen Video-Link mit http:// oder https:// an." };
    }
    if (!billing_address_line_1 || !billing_postal_code || !billing_city || !billing_country) {
      return { error: "Bitte gib deine vollständige Adresse an." };
    }
    if (!consentAccepted) {
      return { error: "Bitte bestätige die Datenweitergabe für die Zahlungsabwicklung." };
    }

    if (payout_iban && !isValidIban(payout_iban)) {
      return { error: "Bitte gib eine gueltige IBAN an." };
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

    if (company_logo_file instanceof File && company_logo_file.size > 0) {
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

    const profileAdmin = createSupabaseAdmin();
    const { error } = await profileAdmin.from("profiles").upsert(
      {
        id: user.id,
        first_name,
        last_name,
        bio,
        photo_url,
        company_logo_url,
        intro_video_url,
        provider_type: provider_type_raw,
        organization_name,
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

    const { data: verifiedProfile, error: verifiedProfileError } = await profileAdmin
      .from("profiles")
      .select("id,first_name,last_name,organization_name")
      .eq("id", user.id)
      .single<{
        id: string;
        first_name: string | null;
        last_name: string | null;
        organization_name: string | null;
      }>();

    if (
      verifiedProfileError ||
      !verifiedProfile ||
      verifiedProfile.first_name !== first_name ||
      verifiedProfile.last_name !== last_name
    ) {
      logProfileSaveEvent("save_error", {
        context: "profiles.verify",
        userId: user.id,
        message: verifiedProfileError?.message ?? "profiles verify mismatch",
        verifiedProfile,
      });
      return { error: "Das Profil wurde nicht korrekt gespeichert." };
    }

    const payoutProfileAdmin = profileAdmin;
    const payoutProfileDebugSelect = [
      "id",
      "teacher_id",
      "provider",
      "created_at",
      "updated_at",
      "provider_account_id",
      "stripe_account_type",
      "stripe_last_sync_at",
      "payout_method",
      "legal_entity_type",
      "business_type",
      "representative_first_name",
      "representative_last_name",
      "representative_birth_date",
      "representative_email",
      "representative_phone",
      "legal_address_line1",
      "legal_address_line2",
      "legal_postal_code",
      "legal_city",
      "legal_country",
      "stripe_terms_accepted_at",
      "stripe_terms_accepted_ip",
      "stripe_terms_accepted_user_agent",
      "business_profile_url",
      "business_profile_mcc",
      "business_profile_product_description",
    ].join(",");

    const { data: existingPayoutProfiles, error: existingPayoutProfileError } = await payoutProfileAdmin
      .from("provider_payout_profiles")
      .select(
        [
          "id",
          "teacher_id",
          "provider",
          "created_at",
          "updated_at",
          "payout_method",
          "iban_last4",
          "paypal_email",
          "address",
          "data_transfer_consent_accepted_at",
          "stripe_terms_accepted_at",
          "stripe_terms_accepted_ip",
          "stripe_terms_accepted_user_agent",
        ].join(",")
      )
      .eq("teacher_id", user.id)
      .eq("provider", PROVIDER_PAYOUT_PROFILE_PROVIDER)
      .order("updated_at", { ascending: false })
      .returns<ExistingPayoutProfile[]>();
    const existingPayoutProfile = existingPayoutProfiles?.[0] ?? null;

    logProfilePayoutDebug("existing_profile_lookup", {
      userId: user.id,
      provider: PROVIDER_PAYOUT_PROFILE_PROVIDER,
      existingProfileCount: existingPayoutProfiles?.length ?? 0,
      existingProfileIds: existingPayoutProfiles?.map((profile) => profile.id) ?? [],
      existingProfileId: existingPayoutProfile?.id ?? null,
      existingTeacherId: existingPayoutProfile?.teacher_id ?? null,
      error: existingPayoutProfileError?.message ?? null,
    });

    if (existingPayoutProfileError) {
      logProfileSaveEvent("save_error", {
        context: "provider_payout_profiles.select",
        userId: user.id,
        message: existingPayoutProfileError.message,
      });
      return { error: "Das Auszahlungsprofil konnte nicht geladen werden." };
    }
    if (!payout_iban && (existingPayoutProfile?.payout_method !== "iban" || !existingPayoutProfile.iban_last4)) {
      return { error: "Bitte gib eine IBAN an." };
    }

    const acceptedAt = existingPayoutProfile?.stripe_terms_accepted_at ?? new Date().toISOString();

    const payoutProfilePayload = {
      teacher_id: user.id,
      payout_method: payout_method_raw,
      iban_encrypted: null,
      iban_last4: getIbanLast4(payout_iban) ?? (existingPayoutProfile?.payout_method === "iban" ? existingPayoutProfile.iban_last4 : null),
      paypal_email: null,
      account_holder_name,
      address:
        buildBillingAddress({
          billing_address_line_1,
          billing_address_line_2,
          billing_postal_code,
          billing_city,
          billing_country,
        }) ?? existingPayoutProfile?.address ?? null,
      tax_number,
      vat_id,
      vat_status: vat_status_raw,
      billing_name,
      billing_company_name,
      billing_address_line_1,
      billing_address_line_2,
      billing_postal_code,
      billing_city,
      billing_country,
      legal_entity_type,
      business_type: legal_entity_type,
      representative_first_name,
      representative_last_name,
      representative_birth_date,
      representative_email,
      representative_phone,
      legal_address_line1,
      legal_address_line2,
      legal_postal_code,
      legal_city,
      legal_country,
      stripe_terms_accepted_at: acceptedAt,
      stripe_terms_accepted_ip: existingPayoutProfile?.stripe_terms_accepted_ip ?? clientIp,
      stripe_terms_accepted_user_agent: existingPayoutProfile?.stripe_terms_accepted_user_agent ?? userAgent,
      business_profile_url,
      business_profile_mcc,
      business_profile_product_description,
      verification_status: "pending",
      provider: PROVIDER_PAYOUT_PROFILE_PROVIDER,
      data_transfer_consent_accepted_at: existingPayoutProfile?.data_transfer_consent_accepted_at ?? new Date().toISOString(),
    };

    const payoutProfileQuery = existingPayoutProfile?.id
      ? payoutProfileAdmin
          .from("provider_payout_profiles")
          .update(payoutProfilePayload)
          .eq("teacher_id", user.id)
          .eq("provider", PROVIDER_PAYOUT_PROFILE_PROVIDER)
          .select(payoutProfileDebugSelect)
          .returns<SavedPayoutProfileDebug[]>()
      : payoutProfileAdmin
          .from("provider_payout_profiles")
          .insert(payoutProfilePayload)
          .select(payoutProfileDebugSelect)
          .returns<SavedPayoutProfileDebug[]>();

    const { data: savedPayoutProfileRaw, error: payoutProfileError } = await payoutProfileQuery;
    const savedPayoutProfiles = savedPayoutProfileRaw as SavedPayoutProfileDebug[] | null;
    const savedPayoutProfile = savedPayoutProfiles?.[0] ?? null;

    if (payoutProfileError) {
      logProfileSaveEvent("save_error", {
        context: existingPayoutProfile?.id
          ? "provider_payout_profiles.update"
          : "provider_payout_profiles.insert",
        userId: user.id,
        message: payoutProfileError.message,
        details: payoutProfileError.details,
        hint: payoutProfileError.hint,
        code: payoutProfileError.code,
      });
      return {
        error: `Das Finanzprofil konnte nicht gespeichert werden: ${payoutProfileError.message}`,
      };
    }

    const { data: reloadedPayoutProfilesRaw, error: reloadedPayoutProfileError } = await payoutProfileAdmin
      .from("provider_payout_profiles")
      .select(payoutProfileDebugSelect)
      .eq("teacher_id", user.id)
      .eq("provider", PROVIDER_PAYOUT_PROFILE_PROVIDER)
      .order("updated_at", { ascending: false })
      .returns<SavedPayoutProfileDebug[]>();
    const reloadedPayoutProfiles = reloadedPayoutProfilesRaw as SavedPayoutProfileDebug[] | null;
    const reloadedPayoutProfile = reloadedPayoutProfiles?.[0] ?? null;

    logProfilePayoutDebug("profile_saved_and_reloaded", {
      userId: user.id,
      provider: PROVIDER_PAYOUT_PROFILE_PROVIDER,
      savedProfileCount: savedPayoutProfiles?.length ?? 0,
      savedProfileIds: savedPayoutProfiles?.map((profile) => profile.id) ?? [],
      savedProfileId: savedPayoutProfile?.id ?? null,
      savedTeacherId: savedPayoutProfile?.teacher_id ?? null,
      savedProviderAccountId: savedPayoutProfile?.provider_account_id ?? null,
      savedStripeAccountType: savedPayoutProfile?.stripe_account_type ?? null,
      savedStripeLastSyncAt: savedPayoutProfile?.stripe_last_sync_at ?? null,
      savedLegalEntityType: savedPayoutProfile?.legal_entity_type ?? null,
      savedRepresentativeBirthDate: savedPayoutProfile?.representative_birth_date ?? null,
      savedRepresentativeEmail: savedPayoutProfile?.representative_email ?? null,
      savedLegalAddressLine1: savedPayoutProfile?.legal_address_line1 ?? null,
      savedStripeTermsAcceptedAt: savedPayoutProfile?.stripe_terms_accepted_at ?? null,
      savedPayoutMethod: savedPayoutProfile?.payout_method ?? null,
      reloadedProfileCount: reloadedPayoutProfiles?.length ?? 0,
      reloadedProfileIds: reloadedPayoutProfiles?.map((profile) => profile.id) ?? [],
      reloadedProfileId: reloadedPayoutProfile?.id ?? null,
      reloadedProviderAccountId: reloadedPayoutProfile?.provider_account_id ?? null,
      reloadedStripeAccountType: reloadedPayoutProfile?.stripe_account_type ?? null,
      reloadedStripeLastSyncAt: reloadedPayoutProfile?.stripe_last_sync_at ?? null,
      reloadedLegalEntityType: reloadedPayoutProfile?.legal_entity_type ?? null,
      reloadedRepresentativeBirthDate: reloadedPayoutProfile?.representative_birth_date ?? null,
      reloadedRepresentativeEmail: reloadedPayoutProfile?.representative_email ?? null,
      reloadedLegalAddressLine1: reloadedPayoutProfile?.legal_address_line1 ?? null,
      reloadedStripeTermsAcceptedAt: reloadedPayoutProfile?.stripe_terms_accepted_at ?? null,
      reloadedPayoutMethod: reloadedPayoutProfile?.payout_method ?? null,
      reloadError: reloadedPayoutProfileError?.message ?? null,
    });

    if (reloadedPayoutProfileError || !reloadedPayoutProfile) {
      return {
        error:
          reloadedPayoutProfileError?.message ??
          "Das Finanzprofil wurde gespeichert, konnte aber nicht erneut geladen werden.",
      };
    }

    const verifyFailures = verifySavedPayoutProfile({
      row: reloadedPayoutProfile,
      userId: user.id,
      payout_method: payout_method_raw,
      legal_entity_type,
      representative_birth_date,
      representative_email,
      legal_address_line1,
      legal_postal_code,
      legal_city,
      legal_country,
      business_profile_url,
      business_profile_product_description,
      consentAccepted,
    });
    const saveDebug = buildSaveDebug({
      formDataKeys,
      userId: user.id,
      first_name,
      last_name,
      phone,
      representative_birth_date,
      organization_name,
      business_profile_url,
      business_profile_product_description,
      legal_entity_type,
      data_transfer_consent: formData.get("data_transfer_consent"),
      stripe_terms_accepted: formData.get("stripe_terms_accepted"),
      consentAccepted,
      payout_method: payout_method_raw,
      billing_address_line_1,
      billing_postal_code,
      billing_city,
      billing_country,
      existingRows: existingPayoutProfiles,
      savedRows: savedPayoutProfiles,
      verifyRow: reloadedPayoutProfile,
      verifyFailures,
    });

    if (verifyFailures.length > 0) {
      logProfileSaveEvent("save_error", {
        context: "provider_payout_profiles.verify",
        userId: user.id,
        rowId: reloadedPayoutProfile.id,
        teacherId: reloadedPayoutProfile.teacher_id,
        provider: reloadedPayoutProfile.provider,
        failures: verifyFailures,
        reloadedPayoutProfile,
      });
      return {
        error: `Das Finanzprofil wurde nicht korrekt gespeichert: ${verifyFailures.join(", ")}.`,
        debug: saveDebug,
      };
    }

    let customConnectWarning: string | undefined;

    try {
      const refreshedBillingProfile = await getProviderBillingProfile(profileAdmin, user.id);
      const customConnectReadiness = getProviderCustomConnectReadiness(refreshedBillingProfile);
      const providerPayoutProfileId =
        refreshedBillingProfile?.providerPayoutProfileId ?? reloadedPayoutProfile.id;
      const providerAccountIdBefore =
        refreshedBillingProfile?.providerAccountId ?? reloadedPayoutProfile.provider_account_id;
      const shouldPrepareCustomConnect =
        Boolean(providerAccountIdBefore) || customConnectReadiness.isReadyForCustomAccountCreation;
      const autoPrepareBlockers = getCustomConnectAutoPrepareBlockers({
        providerPayoutProfileId,
        providerAccountIdBefore,
        isReadyForCustomAccountCreation: customConnectReadiness.isReadyForCustomAccountCreation,
        missingFields: customConnectReadiness.missingFields,
      });

      logProfilePayoutDebug("custom_connect_auto_prepare_gate", {
        userId: user.id,
        providerPayoutProfileId,
        provider: PROVIDER_PAYOUT_PROFILE_PROVIDER,
        providerProfileLoaded: Boolean(refreshedBillingProfile),
        customConnectReady: customConnectReadiness.isReadyForCustomAccountCreation,
        missingFields: customConnectReadiness.missingFields,
        missingFieldCount: customConnectReadiness.missingFields.length,
        warnings: customConnectReadiness.warnings,
        warningCount: customConnectReadiness.warnings.length,
        providerAccountIdBefore,
        stripeAccountTypeBefore:
          refreshedBillingProfile?.stripeAccountType ?? reloadedPayoutProfile.stripe_account_type,
        stripeLastSyncAtBefore:
          refreshedBillingProfile?.stripeLastSyncAt ?? reloadedPayoutProfile.stripe_last_sync_at,
        hasPayoutDestination: Boolean(refreshedBillingProfile?.payoutDestination),
        hasAccountHolderName: Boolean(refreshedBillingProfile?.accountHolderName),
        hasLegalEntityType: Boolean(refreshedBillingProfile?.legalEntityType),
        hasRepresentativeFirstName: Boolean(refreshedBillingProfile?.representativeFirstName),
        hasRepresentativeLastName: Boolean(refreshedBillingProfile?.representativeLastName),
        hasRepresentativeBirthDate: Boolean(refreshedBillingProfile?.representativeBirthDate),
        hasRepresentativeEmail: Boolean(refreshedBillingProfile?.representativeEmail),
        hasLegalAddressLine1: Boolean(refreshedBillingProfile?.legalAddressLine1),
        hasLegalPostalCode: Boolean(refreshedBillingProfile?.legalPostalCode),
        hasLegalCity: Boolean(refreshedBillingProfile?.legalCity),
        hasLegalCountry: Boolean(refreshedBillingProfile?.legalCountry),
        hasStripeTermsAcceptedAt: Boolean(refreshedBillingProfile?.stripeTermsAcceptedAt),
        autoPrepareBlockers,
        createOrUpdateCustomAccountForProviderCalled: shouldPrepareCustomConnect,
      });

      if (shouldPrepareCustomConnect) {
        const account = await createOrUpdateCustomAccountForProvider(user.id);
        logProfilePayoutDebug("custom_connect_auto_prepare_result", {
          userId: user.id,
          providerPayoutProfileId,
          provider: PROVIDER_PAYOUT_PROFILE_PROVIDER,
          providerAccountIdBefore,
          providerAccountIdAfter: account.id,
          stripeAccountTypeAfter: account.type,
          createOrUpdateCustomAccountForProviderCalled: true,
        });
      } else {
        logProfilePayoutDebug("custom_connect_auto_prepare_skipped", {
          userId: user.id,
          providerPayoutProfileId,
          provider: PROVIDER_PAYOUT_PROFILE_PROVIDER,
          customConnectReady: customConnectReadiness.isReadyForCustomAccountCreation,
          missingFields: customConnectReadiness.missingFields,
          warnings: customConnectReadiness.warnings,
          providerAccountIdBefore,
          autoPrepareBlockers,
          createOrUpdateCustomAccountForProviderCalled: false,
        });
      }
    } catch (error: unknown) {
      customConnectWarning =
        "Profil gespeichert. Die automatische Zahlungsabwicklung konnte noch nicht vorbereitet werden.";
      logProfileSaveEvent("save_warning", {
        context: "custom_connect.auto_prepare",
        userId: user.id,
        providerPayoutProfileId: reloadedPayoutProfile.id,
        teacherId: user.id,
        provider: PROVIDER_PAYOUT_PROFILE_PROVIDER,
        ...getStripeErrorLogPayload(error),
      });
    }

    const combinedWarning = [warning, customConnectWarning].filter(Boolean).join(" ");

    if (combinedWarning) {
      logProfileSaveEvent("save_warning", {
        context: "profile.saved.with_upload_warning",
        userId: user.id,
      });
      return {
        success: "Profil gespeichert.",
        warning: combinedWarning,
        debug: saveDebug,
      };
    }

    return {
      success: "Profil gespeichert.",
      debug: saveDebug,
    };
  } catch (error: unknown) {
    logProfileSaveEvent("save_error", {
      context: "save_profile_action.exception",
      message: error instanceof Error ? error.message : String(error),
    });
    return { error: "Beim Speichern des Profils ist ein Fehler aufgetreten. Bitte versuche es erneut." };
  }
}

export async function saveProfileAction(formData: FormData): Promise<SaveProfileState> {
  return saveUnifiedProviderProfile(formData);
}

export async function prepareCustomConnectAction(): Promise<SaveProfileState> {
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

    await createOrUpdateCustomAccountForProvider(user.id);

    return {
      success: "Auszahlungsabwicklung vorbereitet. Die Angaben werden jetzt geprüft.",
    };
  } catch (error: unknown) {
    console.error("[custom-connect]", {
      kind: "prepare_custom_connect_error",
      ...getStripeErrorLogPayload(error),
    });

    return {
      error:
        "Die Auszahlungsabwicklung konnte gerade nicht vorbereitet werden. Dein Profil bleibt gespeichert. Bitte versuche es später erneut.",
    };
  }
}
