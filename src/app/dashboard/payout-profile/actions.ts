"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isProviderBillingVatStatus, type ProviderLegalEntityType } from "@/lib/provider-billing-profile";
import {
  getIbanLast4,
  isProviderPayoutMethod,
  isValidEmail,
  isValidIban,
  normalizeIban,
  normalizeOptionalText,
  normalizePaypalEmail,
  PROVIDER_PAYOUT_PROFILE_PROVIDER,
} from "@/lib/payout-profile";

export type SavePayoutProfileState = {
  success?: string;
  error?: string;
};

type ExistingPayoutProfileRow = {
  id: string;
  payout_method: string | null;
  iban_last4: string | null;
  paypal_email: string | null;
  stripe_terms_accepted_at: string | null;
};

function isProviderLegalEntityType(value: string | null): value is ProviderLegalEntityType {
  return value === "individual" || value === "company" || value === "nonprofit";
}

function normalizeDateInput(value: FormDataEntryValue | null): string | null {
  const normalized = normalizeOptionalText(value);
  if (!normalized) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
}

function logPayoutProfileEvent(kind: "validation_error" | "save_error", payload: Record<string, unknown>) {
  console.error("[provider-payout-profile]", {
    kind,
    ...payload,
  });
}

export async function savePayoutProfileAction(formData: FormData): Promise<SavePayoutProfileState> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { error: "Deine Sitzung ist abgelaufen. Bitte melde dich erneut an." };
    }

    const account_holder_name = normalizeOptionalText(formData.get("account_holder_name"));
    const address = normalizeOptionalText(formData.get("address"));
    const payout_method_raw = normalizeOptionalText(formData.get("payout_method"));
    const tax_number = normalizeOptionalText(formData.get("tax_number"));
    const vat_id = normalizeOptionalText(formData.get("vat_id"));
    const vat_status_raw = normalizeOptionalText(formData.get("vat_status"));
    const legal_entity_type_raw = normalizeOptionalText(formData.get("legal_entity_type"));
    const business_type = normalizeOptionalText(formData.get("business_type"));
    const representative_first_name = normalizeOptionalText(formData.get("representative_first_name"));
    const representative_last_name = normalizeOptionalText(formData.get("representative_last_name"));
    const representative_birth_date = normalizeDateInput(formData.get("representative_birth_date"));
    const representative_email = normalizePaypalEmail(normalizeOptionalText(formData.get("representative_email")));
    const representative_phone = normalizeOptionalText(formData.get("representative_phone"));
    const legal_address_line1 = normalizeOptionalText(formData.get("legal_address_line1"));
    const legal_address_line2 = normalizeOptionalText(formData.get("legal_address_line2"));
    const legal_postal_code = normalizeOptionalText(formData.get("legal_postal_code"));
    const legal_city = normalizeOptionalText(formData.get("legal_city"));
    const legal_country = normalizeOptionalText(formData.get("legal_country"));
    const business_profile_url = normalizeOptionalText(formData.get("business_profile_url"));
    const business_profile_mcc = normalizeOptionalText(formData.get("business_profile_mcc"));
    const business_profile_product_description = normalizeOptionalText(
      formData.get("business_profile_product_description")
    );
    const consentAccepted = formData.get("data_transfer_consent") === "on";
    const stripeTermsAccepted = formData.get("stripe_terms_accepted") === "on";

    if (!account_holder_name) {
      return { error: "Bitte gib den Namen oder die Firma an." };
    }

    if (!address) {
      return { error: "Bitte gib die Adresse an." };
    }

    if (!isProviderPayoutMethod(payout_method_raw)) {
      logPayoutProfileEvent("validation_error", {
        context: "payout_method",
        userId: user.id,
        payoutMethod: payout_method_raw,
      });
      return { error: "Bitte waehle eine gueltige Auszahlungsmethode." };
    }

    if (vat_status_raw && !isProviderBillingVatStatus(vat_status_raw)) {
      logPayoutProfileEvent("validation_error", {
        context: "vat_status",
        userId: user.id,
        vatStatus: vat_status_raw,
      });
      return { error: "Bitte waehle einen gueltigen Umsatzsteuerstatus." };
    }

    if (legal_entity_type_raw && !isProviderLegalEntityType(legal_entity_type_raw)) {
      logPayoutProfileEvent("validation_error", {
        context: "legal_entity_type",
        userId: user.id,
        legalEntityType: legal_entity_type_raw,
      });
      return { error: "Bitte waehle eine gueltige Rechtsform." };
    }

    if (representative_email && !isValidEmail(representative_email)) {
      return { error: "Bitte gib eine gueltige E-Mail fuer die Vertreter*in an." };
    }

    if (!consentAccepted) {
      return {
        error: "Bitte bestaetige die Datenweitergabe fuer die spaetere Zahlungsabwicklung.",
      };
    }

    const { data: existingProfile, error: existingProfileError } = await supabase
      .from("provider_payout_profiles")
      .select("id,payout_method,iban_last4,paypal_email,stripe_terms_accepted_at")
      .eq("teacher_id", user.id)
      .eq("provider", PROVIDER_PAYOUT_PROFILE_PROVIDER)
      .maybeSingle<ExistingPayoutProfileRow>();

    if (existingProfileError) {
      logPayoutProfileEvent("save_error", {
        context: "provider_payout_profiles.select",
        userId: user.id,
        message: existingProfileError.message,
      });
      return { error: "Das bestehende Auszahlungsprofil konnte nicht geladen werden." };
    }

    const requestHeaders = await headers();
    const existingTermsAcceptedAt = existingProfile?.stripe_terms_accepted_at ?? null;
    const termsWereNewlyAccepted = Boolean(stripeTermsAccepted && !existingTermsAcceptedAt);
    const nextTermsAcceptedAt = stripeTermsAccepted
      ? existingTermsAcceptedAt ?? new Date().toISOString()
      : existingTermsAcceptedAt;

    let iban_last4: string | null = null;
    let paypal_email: string | null = null;

    if (payout_method_raw === "iban") {
      const normalizedIban = normalizeIban(normalizeOptionalText(formData.get("iban")));

      if (normalizedIban) {
        if (!isValidIban(normalizedIban)) {
          return { error: "Bitte gib eine gueltige IBAN an." };
        }
        iban_last4 = getIbanLast4(normalizedIban);
      } else if (existingProfile?.payout_method === "iban" && existingProfile.iban_last4) {
        iban_last4 = existingProfile.iban_last4;
      }

      if (!iban_last4) {
        return { error: "Bitte gib eine gueltige IBAN an." };
      }
    }

    if (payout_method_raw === "paypal") {
      paypal_email = normalizePaypalEmail(normalizeOptionalText(formData.get("paypal_email")));
      if (!paypal_email && existingProfile?.payout_method === "paypal" && existingProfile.paypal_email) {
        paypal_email = existingProfile.paypal_email;
      }
      if (!isValidEmail(paypal_email)) {
        return { error: "Bitte gib eine gueltige PayPal-E-Mail an." };
      }
    }

    const payload = {
      teacher_id: user.id,
      payout_method: payout_method_raw,
      iban_encrypted: null,
      iban_last4,
      paypal_email,
      account_holder_name,
      address,
      tax_number,
      vat_id,
      vat_status: vat_status_raw,
      legal_entity_type: legal_entity_type_raw,
      business_type,
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
      stripe_terms_accepted_at: nextTermsAcceptedAt,
      stripe_terms_accepted_ip: termsWereNewlyAccepted
        ? requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || null
        : undefined,
      stripe_terms_accepted_user_agent: termsWereNewlyAccepted ? requestHeaders.get("user-agent") : undefined,
      business_profile_url,
      business_profile_mcc,
      business_profile_product_description,
      verification_status: "pending",
      provider: PROVIDER_PAYOUT_PROFILE_PROVIDER,
      data_transfer_consent_accepted_at: new Date().toISOString(),
    };

    const query = existingProfile?.id
      ? supabase.from("provider_payout_profiles").update(payload).eq("id", existingProfile.id)
      : supabase.from("provider_payout_profiles").insert(payload);

    const { error } = await query;

    if (error) {
      logPayoutProfileEvent("save_error", {
        context: existingProfile?.id ? "provider_payout_profiles.update" : "provider_payout_profiles.insert",
        userId: user.id,
        message: error.message,
      });
      return { error: "Das Auszahlungsprofil konnte nicht gespeichert werden." };
    }

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/profile");
    revalidatePath("/dashboard/payout-profile");

    return { success: "Auszahlungsprofil gespeichert." };
  } catch (error: unknown) {
    logPayoutProfileEvent("save_error", {
      context: "save_payout_profile_action.exception",
      message: error instanceof Error ? error.message : String(error),
    });
    return { error: "Beim Speichern des Auszahlungsprofils ist ein Fehler aufgetreten." };
  }
}
