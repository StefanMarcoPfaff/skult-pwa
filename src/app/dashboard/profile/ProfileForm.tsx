"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  PROVIDER_BILLING_VAT_STATUSES,
  type ProviderBillingVatStatus,
  type ProviderLegalEntityType,
} from "@/lib/provider-billing-profile";
import {
  getProfileImageMaxSizeLabel,
  validateProfileImageFile,
} from "@/lib/profile-image-upload";
import { maskIbanLast4 } from "@/lib/payout-profile";
import type { ProviderType } from "@/lib/provider-profiles";
import {
  saveUnifiedProviderProfile,
  type SaveProfileState,
} from "./actions";

type ProfileFormProps = {
  initialSection: string;
  initialValues: {
    auth_email: string;
    first_name: string;
    last_name: string;
    phone: string;
    bio: string;
    photo_url: string;
    company_logo_url: string;
    intro_video_url: string;
    provider_type: ProviderType;
    organization_name: string;
    address_line_1: string;
    address_line_2: string;
    postal_code: string;
    city: string;
    country: string;
    tax_number: string;
    vat_id: string;
    vat_status: ProviderBillingVatStatus | "";
    payout_method: "iban";
    account_holder_name: string;
    iban_last4: string;
    legal_entity_type: ProviderLegalEntityType | "";
    representative_birth_date: string;
    business_profile_url: string;
    business_profile_product_description: string;
    consentAccepted: boolean;
    payoutComplete: boolean;
    stripeAccountType: string;
    stripeDetailsSubmitted: boolean;
    customConnectAccountExists: boolean;
    customConnectReady: boolean;
    customConnectMissingFields: string[];
    customConnectWarnings: string[];
    stripeRequirementsCurrentlyDue: string[];
    stripeRequirementsEventuallyDue: string[];
    stripeRequirementsPastDue: string[];
    stripeRequirementsDisabledReason: string;
    stripeChargesEnabled: boolean;
    stripePayoutsEnabled: boolean;
  };
};

function sectionIsOpen(initialSection: string, section: string, fallback = false): boolean {
  return initialSection === section || (!initialSection && fallback);
}

function getFriendlyRequirementLabel(requirement: string): string {
  const normalized = requirement.toLowerCase();

  if (normalized.includes("verification.document")) {
    return normalized.startsWith("company.") ? "Unternehmensnachweis" : "Identitätsnachweis";
  }
  if (normalized.includes("dob")) return "Geburtsdatum";
  if (normalized.includes("address")) return "Adresse";
  if (normalized === "external_account" || normalized.includes(".external_account")) return "Auszahlungskonto";
  if (normalized.includes("representative") || normalized.includes("relationship.representative")) {
    return "Vertretungsberechtigte Person";
  }
  if (normalized.includes("email")) return "E-Mail-Adresse";
  if (normalized.includes("phone")) return "Telefonnummer";
  if (normalized.includes("business_profile")) return "Business-Informationen";
  if (normalized.includes("tos_acceptance")) return "Zustimmung zur Zahlungsabwicklung";
  if (normalized.includes("company.tax_id") || normalized.includes("vat_id")) return "Steuerangaben";
  return "Weitere Angabe erforderlich";
}

function uniqueLabels(values: string[]): string[] {
  return Array.from(new Set(values.map(getFriendlyRequirementLabel)));
}

function getPaymentPreparationStatus(input: {
  hasMissingProfileFields: boolean;
  hasAccount: boolean;
  isReadyForPreparation: boolean;
  hasOpenRequirements: boolean;
  isPaymentProcessingConfigured: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
}): string {
  if (input.isPaymentProcessingConfigured) {
    return "Zahlungsabwicklung eingerichtet";
  }

  if (input.hasMissingProfileFields) {
    return "Für die automatische Zahlungsabwicklung fehlen noch Angaben.";
  }

  if (input.payoutsEnabled && input.chargesEnabled) {
    return "Auszahlungen sind vorbereitet.";
  }

  if (input.hasOpenRequirements) {
    return "Für Auszahlungen werden noch weitere Angaben benötigt.";
  }

  if (input.hasAccount) {
    return "Die Zahlungsabwicklung wird vorbereitet. Sobald alles freigegeben ist, kannst Du kostenpflichtige Angebote nutzen.";
  }

  if (input.isReadyForPreparation) {
    return "Deine Angaben sind vollständig. RESER bereitet die Zahlungsabwicklung automatisch vor.";
  }

  return "Für die automatische Zahlungsabwicklung fehlen noch Angaben.";
}

export default function ProfileForm({ initialSection, initialValues }: ProfileFormProps) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [state, setState] = useState<SaveProfileState>({});
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState(initialValues.photo_url);
  const [photoObjectUrl, setPhotoObjectUrl] = useState<string | null>(null);
  const [companyLogoPreviewUrl, setCompanyLogoPreviewUrl] = useState(initialValues.company_logo_url);
  const [companyLogoObjectUrl, setCompanyLogoObjectUrl] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState(initialValues.intro_video_url);
  const [videoUrlError, setVideoUrlError] = useState<string | null>(null);
  const [providerType, setProviderType] = useState<ProviderType>(initialValues.provider_type);

  useEffect(() => {
    return () => {
      if (photoObjectUrl) URL.revokeObjectURL(photoObjectUrl);
      if (companyLogoObjectUrl) URL.revokeObjectURL(companyLogoObjectUrl);
    };
  }, [companyLogoObjectUrl, photoObjectUrl]);

  const submitAction = async (formData: FormData) => {
    setFileError(null);
    setState({});
    const introVideoUrl = String(formData.get("intro_video_url") || "").trim();
    if (introVideoUrl && !/^https?:\/\//i.test(introVideoUrl)) {
      setVideoUrlError("Bitte gib einen gültigen Link mit http:// oder https:// an.");
      return;
    }
    setVideoUrlError(null);
    setIsSaving(true);

    try {
      const result = await saveUnifiedProviderProfile(formData);
      setState(result);

      if (result.redirectTo) {
        router.push(result.redirectTo);
      } else if (result.success) {
        router.refresh();
      }
    } catch {
      setState({
        error: "Beim Speichern des Profils ist ein Fehler aufgetreten. Bitte versuche es erneut.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const maskedIban = maskIbanLast4(initialValues.iban_last4);
  const friendlyRequirements = uniqueLabels([
    ...initialValues.stripeRequirementsCurrentlyDue,
    ...initialValues.stripeRequirementsPastDue,
  ]);
  const isPaymentProcessingConfigured =
    initialValues.customConnectAccountExists &&
    initialValues.stripeAccountType === "custom" &&
    initialValues.stripeChargesEnabled &&
    initialValues.stripePayoutsEnabled &&
    initialValues.stripeDetailsSubmitted &&
    initialValues.stripeRequirementsCurrentlyDue.length === 0;
  const hasOpenStripeRequirements =
    !isPaymentProcessingConfigured &&
    (friendlyRequirements.length > 0 || Boolean(initialValues.stripeRequirementsDisabledReason));
  const paymentPreparationStatus = getPaymentPreparationStatus({
    hasMissingProfileFields: initialValues.customConnectMissingFields.length > 0,
    hasAccount: initialValues.customConnectAccountExists,
    isReadyForPreparation: initialValues.customConnectReady,
    hasOpenRequirements: hasOpenStripeRequirements,
    isPaymentProcessingConfigured,
    chargesEnabled: initialValues.stripeChargesEnabled,
    payoutsEnabled: initialValues.stripePayoutsEnabled,
  });
  const showEventuallyDueNotice =
    initialValues.stripeRequirementsEventuallyDue.length > 0 && isPaymentProcessingConfigured;
  const formVersion = [
    initialValues.first_name,
    initialValues.last_name,
    initialValues.phone,
    initialValues.representative_birth_date,
    initialValues.organization_name,
    initialValues.business_profile_url,
    initialValues.business_profile_product_description,
    initialValues.legal_entity_type,
    initialValues.consentAccepted ? "terms-accepted" : "terms-open",
    initialValues.address_line_1,
    initialValues.postal_code,
    initialValues.city,
    initialValues.country,
    initialValues.payout_method,
    initialValues.account_holder_name,
    initialValues.iban_last4,
  ].join("|");

  return (
    <form key={formVersion} action={submitAction} className="space-y-4">
      <details open={sectionIsOpen(initialSection, "persoenlich", true)} className="rounded-2xl border p-5">
        <summary className="cursor-pointer text-base font-semibold">Persönliche Daten</summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-sm font-medium">Vorname *</span>
            <input name="first_name" required defaultValue={initialValues.first_name} className="w-full rounded-xl border px-3 py-2 text-sm" />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium">Nachname *</span>
            <input name="last_name" required defaultValue={initialValues.last_name} className="w-full rounded-xl border px-3 py-2 text-sm" />
          </label>
          {initialValues.auth_email ? (
            <div className="space-y-1">
              <span className="text-sm font-medium">E-Mail</span>
              <p className="rounded-xl border bg-slate-50 px-3 py-2 text-sm text-slate-700">{initialValues.auth_email}</p>
            </div>
          ) : null}
          <label className="space-y-1">
            <span className="text-sm font-medium">Telefon</span>
            <input name="phone" defaultValue={initialValues.phone} className="w-full rounded-xl border px-3 py-2 text-sm" />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium">Geburtsdatum</span>
            <input type="date" name="representative_birth_date" defaultValue={initialValues.representative_birth_date} className="w-full rounded-xl border px-3 py-2 text-sm" />
          </label>
        </div>
      </details>

      <details open={sectionIsOpen(initialSection, "anbieterprofil")} className="rounded-2xl border p-5">
        <summary className="cursor-pointer text-base font-semibold">Anbieterprofil</summary>
        <div className="mt-4 space-y-4">
          <label className="block space-y-1">
            <span className="text-sm font-medium">Anbietertyp *</span>
            <select name="provider_type" value={providerType} onChange={(event) => setProviderType(event.target.value as ProviderType)} className="w-full rounded-xl border px-3 py-2 text-sm">
              <option value="independent_teacher">Einzelanbieter*in</option>
              <option value="studio_provider">Organisation</option>
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">Organisation / Firma / Anbietername</span>
            <input name="organization_name" defaultValue={initialValues.organization_name} className="w-full rounded-xl border px-3 py-2 text-sm" />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">Website / Profil-URL</span>
            <input name="business_profile_url" defaultValue={initialValues.business_profile_url} className="w-full rounded-xl border px-3 py-2 text-sm" />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">Produktbeschreibung</span>
            <input name="business_profile_product_description" defaultValue={initialValues.business_profile_product_description} className="w-full rounded-xl border px-3 py-2 text-sm" />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">Beschreibung / Bio</span>
            <textarea name="bio" rows={5} defaultValue={initialValues.bio} className="w-full rounded-xl border px-3 py-2 text-sm" />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-sm font-medium">Profilbild</span>
              <input
                type="file"
                name="photo_file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => {
                  const nextFile = event.target.files?.[0];
                  if (!nextFile) {
                    setFileError(null);
                    if (photoObjectUrl) URL.revokeObjectURL(photoObjectUrl);
                    setPhotoObjectUrl(null);
                    setPhotoPreviewUrl(initialValues.photo_url);
                    return;
                  }
                  const validation = validateProfileImageFile({ size: nextFile.size, type: nextFile.type, name: nextFile.name });
                  if (!validation.ok) {
                    setFileError(validation.error);
                    event.target.value = "";
                    return;
                  }
                  if (photoObjectUrl) URL.revokeObjectURL(photoObjectUrl);
                  const objectUrl = URL.createObjectURL(nextFile);
                  setPhotoObjectUrl(objectUrl);
                  setPhotoPreviewUrl(objectUrl);
                  setFileError(null);
                }}
                className="w-full rounded-xl border px-3 py-2 text-sm"
              />
              <span className="block text-xs text-muted-foreground">JPG, PNG oder WebP, maximal {getProfileImageMaxSizeLabel()}</span>
              <input type="hidden" name="existing_photo_url" value={initialValues.photo_url} />
              {photoPreviewUrl.trim() ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoPreviewUrl} alt="Profilbild Vorschau" className="mt-2 h-24 w-24 rounded-lg border object-cover" />
              ) : null}
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium">Logo</span>
              <input
                type="file"
                name="company_logo_file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => {
                  const nextFile = event.target.files?.[0];
                  if (!nextFile) {
                    setFileError(null);
                    if (companyLogoObjectUrl) URL.revokeObjectURL(companyLogoObjectUrl);
                    setCompanyLogoObjectUrl(null);
                    setCompanyLogoPreviewUrl(initialValues.company_logo_url);
                    return;
                  }
                  const validation = validateProfileImageFile({ size: nextFile.size, type: nextFile.type, name: nextFile.name });
                  if (!validation.ok) {
                    setFileError(validation.error);
                    event.target.value = "";
                    return;
                  }
                  if (companyLogoObjectUrl) URL.revokeObjectURL(companyLogoObjectUrl);
                  const objectUrl = URL.createObjectURL(nextFile);
                  setCompanyLogoObjectUrl(objectUrl);
                  setCompanyLogoPreviewUrl(objectUrl);
                  setFileError(null);
                }}
                className="w-full rounded-xl border px-3 py-2 text-sm"
              />
              <input type="hidden" name="existing_company_logo_url" value={initialValues.company_logo_url} />
              {companyLogoPreviewUrl.trim() ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={companyLogoPreviewUrl} alt="Logo Vorschau" className="mt-2 h-24 w-24 rounded-lg border bg-white object-contain p-2" />
              ) : null}
            </label>
          </div>
          <label className="block space-y-1">
            <span className="text-sm font-medium">Vorstellungsvideo</span>
            <input name="intro_video_url" value={videoUrl} onChange={(event) => setVideoUrl(event.target.value)} className="w-full rounded-xl border px-3 py-2 text-sm" />
          </label>
        </div>
      </details>

      <details open={sectionIsOpen(initialSection, "rechnung")} className="rounded-2xl border p-5">
        <summary className="cursor-pointer text-base font-semibold">Adresse &amp; Rechnungsdaten</summary>
        <p className="mt-3 text-sm text-muted-foreground">
          Wenn du deine Rechnungs- und Steuerdaten vollstaendig hinterlegst, kann RESER automatische Belege fuer deine
          Buchhaltung und Steuerunterlagen erstellen. Bitte achte darauf, dass deine Angaben korrekt und aktuell sind.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 sm:col-span-2">
            <span className="text-sm font-medium">Straße + Hausnummer *</span>
            <input name="billing_address_line_1" required defaultValue={initialValues.address_line_1} className="w-full rounded-xl border px-3 py-2 text-sm" />
          </label>
          <label className="space-y-1 sm:col-span-2">
            <span className="text-sm font-medium">Adresszusatz</span>
            <input name="billing_address_line_2" defaultValue={initialValues.address_line_2} className="w-full rounded-xl border px-3 py-2 text-sm" />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium">PLZ *</span>
            <input name="billing_postal_code" required defaultValue={initialValues.postal_code} className="w-full rounded-xl border px-3 py-2 text-sm" />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium">Ort *</span>
            <input name="billing_city" required defaultValue={initialValues.city} className="w-full rounded-xl border px-3 py-2 text-sm" />
          </label>
          <label className="space-y-1 sm:col-span-2">
            <span className="text-sm font-medium">Land *</span>
            <input name="billing_country" required defaultValue={initialValues.country} className="w-full rounded-xl border px-3 py-2 text-sm" />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium">Steuernummer</span>
            <input name="tax_number" defaultValue={initialValues.tax_number} className="w-full rounded-xl border px-3 py-2 text-sm" />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium">USt-ID</span>
            <input name="vat_id" defaultValue={initialValues.vat_id} className="w-full rounded-xl border px-3 py-2 text-sm" />
          </label>
          <label className="space-y-1 sm:col-span-2">
            <span className="text-sm font-medium">Umsatzsteuerstatus</span>
            <select name="vat_status" defaultValue={initialValues.vat_status} className="w-full rounded-xl border px-3 py-2 text-sm">
              <option value="">Keine Angabe</option>
              <option value={PROVIDER_BILLING_VAT_STATUSES[0]}>Kleinunternehmer*in</option>
              <option value={PROVIDER_BILLING_VAT_STATUSES[1]}>Umsatzsteuerpflichtig (Steuersatz noch offen)</option>
              <option value={PROVIDER_BILLING_VAT_STATUSES[2]}>Umsatzsteuerpflichtig 19%</option>
              <option value={PROVIDER_BILLING_VAT_STATUSES[3]}>Umsatzsteuerpflichtig 7%</option>
              <option value={PROVIDER_BILLING_VAT_STATUSES[4]}>Steuerbefreit/Gemeinnützig</option>
            </select>
          </label>
          <label className="space-y-1 sm:col-span-2">
            <span className="text-sm font-medium">Rechtsform</span>
            <select name="legal_entity_type" defaultValue={initialValues.legal_entity_type} className="w-full rounded-xl border px-3 py-2 text-sm">
              <option value="">Keine Angabe</option>
              <option value="individual">Einzelperson</option>
              <option value="company">Unternehmen</option>
              <option value="nonprofit">Gemeinnützig / Non-Profit</option>
            </select>
          </label>
        </div>
      </details>

      <details open={sectionIsOpen(initialSection, "auszahlungen")} className="rounded-2xl border p-5">
        <summary className="cursor-pointer text-base font-semibold">Auszahlungen</summary>
        <div className="mt-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            Bitte gib hier die Kontoinhaber*in und IBAN an, auf die RESER Deine Einnahmen auszahlen kann.
          </p>
          <input type="hidden" name="payout_method" value="iban" />
          <label className="block space-y-1">
            <span className="text-sm font-medium">Kontoinhaber*in *</span>
            <input name="account_holder_name" required defaultValue={initialValues.account_holder_name} className="w-full rounded-xl border px-3 py-2 text-sm" />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">IBAN</span>
            <input name="payout_iban" required={!initialValues.iban_last4} autoComplete="off" className="w-full rounded-xl border px-3 py-2 text-sm" />
          </label>
          {maskedIban ? <p className="text-xs text-muted-foreground">Bereits hinterlegt: {maskedIban}</p> : null}
        </div>
      </details>

      <section className="space-y-4 border-t pt-5">
        <h2 className="text-base font-semibold">Automatische Zahlungsabwicklung</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2 rounded-xl border bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <p className="font-medium">{paymentPreparationStatus}</p>
            <p className="mt-1 text-muted-foreground">
              Deine Angaben werden für Buchungen, Auszahlungen und Belege verwendet. Sobald Du kostenpflichtige Angebote
              anbietest, prüft RESER automatisch, ob weitere Angaben benötigt werden.
            </p>
            {initialValues.customConnectMissingFields.length > 0 && !isPaymentProcessingConfigured ? (
              <ul className="mt-3 list-disc space-y-1 pl-5">
                {initialValues.customConnectMissingFields.map((field) => (
                  <li key={field}>{field}</li>
                ))}
              </ul>
            ) : null}
            {friendlyRequirements.length > 0 && !isPaymentProcessingConfigured ? (
              <div className="mt-3">
                <p className="font-medium">Noch benötigt:</p>
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  {friendlyRequirements.map((requirement) => (
                    <li key={requirement}>{requirement}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {showEventuallyDueNotice ? (
              <p className="mt-3 text-muted-foreground">
                Der Zahlungsdienstleister kann zu einem spÃ¤teren Zeitpunkt weitere Nachweise anfordern.
              </p>
            ) : null}
          </div>
          <label className="sm:col-span-2 flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm">
            <input type="checkbox" name="data_transfer_consent" required defaultChecked={initialValues.consentAccepted} className="mt-1 h-4 w-4 rounded border" />
            <span>
              Ich stimme zu, dass RESER die für Buchungen, Zahlungen, Auszahlungen und Belege notwendigen Informationen
              an die jeweils eingebundenen Zahlungsdienstleister weitergeben darf.{" "}
              <Link href="/zahlungsdienstleister" className="font-medium underline underline-offset-4">
                Mehr Informationen
              </Link>
            </span>
          </label>
        </div>
      </section>

      {fileError ? <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{fileError}</p> : null}
      {videoUrlError ? <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{videoUrlError}</p> : null}
      {state.error ? <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p> : null}
      {state.warning ? <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{state.warning}</p> : null}
      {state.success && !state.redirectTo ? <p className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{state.success}</p> : null}

      <button type="submit" disabled={isSaving || Boolean(fileError) || Boolean(videoUrlError)} className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
        {isSaving ? "Speichert..." : "Profil speichern"}
      </button>
    </form>
  );
}

