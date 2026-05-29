"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  PROVIDER_BILLING_VAT_STATUSES,
  type ProviderBillingPayoutMethod,
  type ProviderBillingVatStatus,
} from "@/lib/provider-billing-profile";
import {
  getProfileImageMaxSizeLabel,
  validateProfileImageFile,
} from "@/lib/profile-image-upload";
import { saveProfileAction, type SaveProfileState } from "./actions";
import type { ProviderType } from "@/lib/provider-profiles";

type ProfileFormProps = {
  initialValues: {
    first_name: string;
    last_name: string;
    bio: string;
    photo_url: string;
    company_logo_url: string;
    intro_video_url: string;
    provider_type: ProviderType;
    organization_name: string;
    payout_method: ProviderBillingPayoutMethod;
    billing_name: string;
    billing_company_name: string;
    billing_address_line_1: string;
    billing_address_line_2: string;
    billing_postal_code: string;
    billing_city: string;
    billing_country: string;
    tax_number: string;
    vat_id: string;
    vat_status: ProviderBillingVatStatus | "";
    payout_iban: string;
    payout_paypal_email: string;
  };
};

export default function ProfileForm({ initialValues }: ProfileFormProps) {
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
  const [payoutMethod, setPayoutMethod] = useState<ProviderBillingPayoutMethod>(initialValues.payout_method);

  useEffect(() => {
    return () => {
      if (photoObjectUrl) {
        URL.revokeObjectURL(photoObjectUrl);
      }
      if (companyLogoObjectUrl) {
        URL.revokeObjectURL(companyLogoObjectUrl);
      }
    };
  }, [companyLogoObjectUrl, photoObjectUrl]);

  const submitAction = async (formData: FormData) => {
    setFileError(null);
    setState({});
    const introVideoUrl = String(formData.get("intro_video_url") || "").trim();
    if (introVideoUrl && !/^https?:\/\//i.test(introVideoUrl)) {
      setVideoUrlError("Bitte gib einen gueltigen Link mit http:// oder https:// an.");
      return;
    }
    setVideoUrlError(null);
    setIsSaving(true);

    try {
      const result = await saveProfileAction(formData);
      setState(result);

      if (result.redirectTo) {
        router.push(result.redirectTo);
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

  return (
    <form action={submitAction} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 sm:col-span-2">
          <span className="text-sm font-medium">Anbietertyp *</span>
          <select
            name="provider_type"
            value={providerType}
            onChange={(event) => setProviderType(event.target.value as ProviderType)}
            className="w-full rounded-xl border px-3 py-2 text-sm"
          >
            <option value="independent_teacher">Einzelanbieter*in</option>
            <option value="studio_provider">Organisation</option>
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-sm font-medium">Vorname *</span>
          <input
            name="first_name"
            required
            defaultValue={initialValues.first_name}
            className="w-full rounded-xl border px-3 py-2 text-sm"
          />
        </label>

        <label className="space-y-1">
          <span className="text-sm font-medium">Nachname *</span>
          <input
            name="last_name"
            required
            defaultValue={initialValues.last_name}
            className="w-full rounded-xl border px-3 py-2 text-sm"
          />
        </label>
      </div>

      {providerType === "studio_provider" ? (
        <label className="block space-y-1">
          <span className="text-sm font-medium">Organisationsname *</span>
          <input
            name="organization_name"
            required
            defaultValue={initialValues.organization_name}
            className="w-full rounded-xl border px-3 py-2 text-sm"
            placeholder="z. B. Keramik Nord"
          />
        </label>
      ) : (
        <input type="hidden" name="organization_name" value={initialValues.organization_name} />
      )}

      <label className="block space-y-1">
        <span className="text-sm font-medium">Selbstbeschreibung</span>
        <textarea
          name="bio"
          rows={5}
          defaultValue={initialValues.bio}
          className="w-full rounded-xl border px-3 py-2 text-sm"
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 sm:col-span-2">
          <span className="text-sm font-medium">Profilfoto</span>
          <input
            type="file"
            name="photo_file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => {
              const nextFile = event.target.files?.[0];
              if (!nextFile) {
                setFileError(null);
                if (photoObjectUrl) {
                  URL.revokeObjectURL(photoObjectUrl);
                  setPhotoObjectUrl(null);
                }
                setPhotoPreviewUrl(initialValues.photo_url);
                return;
              }

              const validation = validateProfileImageFile({
                size: nextFile.size,
                type: nextFile.type,
                name: nextFile.name,
              });

              if (!validation.ok) {
                setFileError(validation.error);
                event.target.value = "";
                if (photoObjectUrl) {
                  URL.revokeObjectURL(photoObjectUrl);
                  setPhotoObjectUrl(null);
                }
                setPhotoPreviewUrl(initialValues.photo_url);
                return;
              }

              setFileError(null);
              if (photoObjectUrl) {
                URL.revokeObjectURL(photoObjectUrl);
              }
              const objectUrl = URL.createObjectURL(nextFile);
              setPhotoObjectUrl(objectUrl);
              setPhotoPreviewUrl(objectUrl);
            }}
            className="w-full rounded-xl border px-3 py-2 text-sm"
          />
          <span className="block text-xs text-muted-foreground">
            Optional: JPG, PNG oder WebP, maximal {getProfileImageMaxSizeLabel()}
          </span>
          <input type="hidden" name="existing_photo_url" value={initialValues.photo_url} />
          {photoPreviewUrl.trim() ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoPreviewUrl}
              alt="Profilfoto Vorschau"
              className="mt-2 h-24 w-24 rounded-lg border object-cover"
            />
          ) : null}
        </label>
      </div>

      {providerType === "studio_provider" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 sm:col-span-2">
            <span className="text-sm font-medium">Firmenlogo (optional)</span>
            <input
              type="file"
              name="company_logo_file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => {
                const nextFile = event.target.files?.[0];
                if (!nextFile) {
                  setFileError(null);
                  if (companyLogoObjectUrl) {
                    URL.revokeObjectURL(companyLogoObjectUrl);
                    setCompanyLogoObjectUrl(null);
                  }
                  setCompanyLogoPreviewUrl(initialValues.company_logo_url);
                  return;
                }

                const validation = validateProfileImageFile({
                  size: nextFile.size,
                  type: nextFile.type,
                  name: nextFile.name,
                });

                if (!validation.ok) {
                  setFileError(validation.error);
                  event.target.value = "";
                  if (companyLogoObjectUrl) {
                    URL.revokeObjectURL(companyLogoObjectUrl);
                    setCompanyLogoObjectUrl(null);
                  }
                  setCompanyLogoPreviewUrl(initialValues.company_logo_url);
                  return;
                }

                setFileError(null);
                if (companyLogoObjectUrl) {
                  URL.revokeObjectURL(companyLogoObjectUrl);
                }
                const objectUrl = URL.createObjectURL(nextFile);
                setCompanyLogoObjectUrl(objectUrl);
                setCompanyLogoPreviewUrl(objectUrl);
              }}
              className="w-full rounded-xl border px-3 py-2 text-sm"
            />
            <span className="block text-xs text-muted-foreground">
              Für Studios, Vereine oder Organisationen. Wird später auf E-Mails, Belegen und öffentlichen Profilen
              verwendet.
            </span>
            <span className="block text-xs text-muted-foreground">
              JPG, PNG oder WebP, maximal {getProfileImageMaxSizeLabel()}
            </span>
            <input type="hidden" name="existing_company_logo_url" value={initialValues.company_logo_url} />
            {companyLogoPreviewUrl.trim() ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={companyLogoPreviewUrl}
                alt="Firmenlogo Vorschau"
                className="mt-2 h-24 w-24 rounded-lg border bg-white object-contain p-2"
              />
            ) : null}
          </label>
        </div>
      ) : (
        <input type="hidden" name="existing_company_logo_url" value={initialValues.company_logo_url} />
      )}

      <label className="block space-y-1">
        <span className="text-sm font-medium">Vorstellungsvideo</span>
        <input
          name="intro_video_url"
          value={videoUrl}
          onChange={(event) => {
            setVideoUrl(event.target.value);
            if (videoUrlError) setVideoUrlError(null);
          }}
          className="w-full rounded-xl border px-3 py-2 text-sm"
        />
        <span className="block text-xs text-muted-foreground">
          Optional: Link zu einem YouTube- oder Vimeo-Video
        </span>
        {videoUrl.trim() && /^https?:\/\//i.test(videoUrl.trim()) ? (
          <a
            href={videoUrl.trim()}
            target="_blank"
            rel="noreferrer"
            className="inline-flex text-sm font-medium underline underline-offset-4"
          >
            Video-Link oeffnen
          </a>
        ) : null}
      </label>

      <section className="space-y-4 rounded-2xl border p-4 sm:p-5">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">Abrechnung &amp; Auszahlungen</h2>
          <p className="text-sm text-muted-foreground">
            Diese Angaben helfen uns, spaetere Abrechnungen und Belege fuer dich vorzubereiten.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 sm:col-span-2">
            <span className="text-sm font-medium">Wie moechtest du Auszahlungen erhalten? *</span>
            <select
              name="payout_method"
              value={payoutMethod}
              onChange={(event) => setPayoutMethod(event.target.value as ProviderBillingPayoutMethod)}
              className="w-full rounded-xl border px-3 py-2 text-sm"
            >
              <option value="iban">Auf mein Bankkonto (IBAN)</option>
              <option value="paypal">Auf mein PayPal-Konto</option>
            </select>
          </label>

          {payoutMethod === "iban" ? (
            <label className="space-y-1 sm:col-span-2">
              <span className="text-sm font-medium">IBAN</span>
              <input
                name="payout_iban"
                defaultValue={initialValues.payout_iban}
                className="w-full rounded-xl border px-3 py-2 text-sm"
                placeholder="Optional fuer spaetere Auszahlungen"
              />
            </label>
          ) : (
            <label className="space-y-1 sm:col-span-2">
              <span className="text-sm font-medium">PayPal-E-Mail</span>
              <input
                type="email"
                name="payout_paypal_email"
                defaultValue={initialValues.payout_paypal_email}
                className="w-full rounded-xl border px-3 py-2 text-sm"
                placeholder="Optional fuer spaetere Auszahlungen"
              />
            </label>
          )}
        </div>

        <div className="space-y-1">
          <p className="text-sm font-medium">Optionale Angaben fuer spaetere Abrechnungen und Belege</p>
          <p className="text-xs text-muted-foreground">
            Diese Angaben dienen der Vorbereitung automatischer Belege und Abrechnungen.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-sm font-medium">Name auf Abrechnungen</span>
            <input
              name="billing_name"
              defaultValue={initialValues.billing_name}
              className="w-full rounded-xl border px-3 py-2 text-sm"
              placeholder="z. B. Max Mustermann"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium">Firma oder Organisation</span>
            <input
              name="billing_company_name"
              defaultValue={initialValues.billing_company_name}
              className="w-full rounded-xl border px-3 py-2 text-sm"
              placeholder="Optional"
            />
          </label>

          <label className="space-y-1 sm:col-span-2">
            <span className="text-sm font-medium">Strasse und Hausnummer</span>
            <input
              name="billing_address_line_1"
              defaultValue={initialValues.billing_address_line_1}
              className="w-full rounded-xl border px-3 py-2 text-sm"
              placeholder="Optional"
            />
          </label>

          <label className="space-y-1 sm:col-span-2">
            <span className="text-sm font-medium">Adresszusatz</span>
            <input
              name="billing_address_line_2"
              defaultValue={initialValues.billing_address_line_2}
              className="w-full rounded-xl border px-3 py-2 text-sm"
              placeholder="Optional"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium">PLZ</span>
            <input
              name="billing_postal_code"
              defaultValue={initialValues.billing_postal_code}
              className="w-full rounded-xl border px-3 py-2 text-sm"
              placeholder="Optional"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium">Ort</span>
            <input
              name="billing_city"
              defaultValue={initialValues.billing_city}
              className="w-full rounded-xl border px-3 py-2 text-sm"
              placeholder="Optional"
            />
          </label>

          <label className="space-y-1 sm:col-span-2">
            <span className="text-sm font-medium">Land</span>
            <input
              name="billing_country"
              defaultValue={initialValues.billing_country}
              className="w-full rounded-xl border px-3 py-2 text-sm"
              placeholder="z. B. Deutschland"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium">Steuernummer</span>
            <input
              name="tax_number"
              defaultValue={initialValues.tax_number}
              className="w-full rounded-xl border px-3 py-2 text-sm"
              placeholder="Optional"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium">USt-IdNr.</span>
            <input
              name="vat_id"
              defaultValue={initialValues.vat_id}
              className="w-full rounded-xl border px-3 py-2 text-sm"
              placeholder="Optional"
            />
          </label>

          <label className="space-y-1 sm:col-span-2">
            <span className="text-sm font-medium">Umsatzsteuerstatus</span>
            <select
              name="vat_status"
              defaultValue={initialValues.vat_status}
              className="w-full rounded-xl border px-3 py-2 text-sm"
            >
              <option value="">Keine Angabe</option>
              <option value={PROVIDER_BILLING_VAT_STATUSES[0]}>Kleinunternehmer*in</option>
              <option value={PROVIDER_BILLING_VAT_STATUSES[1]}>Umsatzsteuerpflichtig</option>
              <option value={PROVIDER_BILLING_VAT_STATUSES[2]}>Steuerbefreit/Gemeinnuetzig</option>
            </select>
          </label>
        </div>
      </section>

      {fileError ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {fileError}
        </p>
      ) : null}

      {videoUrlError ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {videoUrlError}
        </p>
      ) : null}

      {state.error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}

      {state.warning ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {state.warning}
        </p>
      ) : null}

      {state.success && !state.redirectTo ? (
        <p className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          {state.success}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isSaving || Boolean(fileError) || Boolean(videoUrlError)}
        className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {isSaving ? "Speichert..." : "Speichern"}
      </button>
    </form>
  );
}
