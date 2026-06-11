"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  PROVIDER_BILLING_VAT_STATUSES,
  type ProviderBillingVatStatus,
  type ProviderLegalEntityType,
} from "@/lib/provider-billing-profile";
import {
  maskEmail,
  maskIbanLast4,
  type ProviderPayoutMethod,
} from "@/lib/payout-profile";
import { savePayoutProfileAction, type SavePayoutProfileState } from "./actions";

type PayoutProfileFormProps = {
  initialValues: {
    first_name: string;
    last_name: string;
    organization_name: string;
    address_line_1: string;
    address_line_2: string;
    postal_code: string;
    city: string;
    country: string;
    payout_method: ProviderPayoutMethod;
    iban_last4: string;
    paypal_email: string;
    tax_number: string;
    vat_id: string;
    vat_status: ProviderBillingVatStatus | "";
    legal_entity_type: ProviderLegalEntityType | "";
    business_type: string;
    representative_birth_date: string;
    representative_phone: string;
    business_profile_url: string;
    business_profile_mcc: string;
    business_profile_product_description: string;
    consentAccepted: boolean;
  };
};

export default function PayoutProfileForm({ initialValues }: PayoutProfileFormProps) {
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<SavePayoutProfileState>({});
  const [payoutMethod, setPayoutMethod] = useState<ProviderPayoutMethod>(initialValues.payout_method);

  const submitAction = (formData: FormData) => {
    setState({});

    startTransition(async () => {
      try {
        const result = await savePayoutProfileAction(formData);
        setState(result);
      } catch {
        setState({
          error: "Beim Speichern des Auszahlungsprofils ist ein Fehler aufgetreten.",
        });
      }
    });
  };

  const maskedIban = maskIbanLast4(initialValues.iban_last4);
  const maskedPaypalEmail = maskEmail(initialValues.paypal_email);

  return (
    <form action={submitAction} className="space-y-5">
      <section className="space-y-4 rounded-2xl border p-4">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">Anbieterprofil / Rechnungsdaten</h2>
          <p className="text-sm text-muted-foreground">
            Diese Angaben werden fuer Belege, Auszahlungen und die spaetere automatische Zahlungsabwicklung verwendet.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
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

          <label className="space-y-1 sm:col-span-2">
            <span className="text-sm font-medium">Unternehmensname / Organisation</span>
            <input
              name="organization_name"
              defaultValue={initialValues.organization_name}
              className="w-full rounded-xl border px-3 py-2 text-sm"
              placeholder="Optional"
            />
          </label>

          <label className="space-y-1 sm:col-span-2">
            <span className="text-sm font-medium">Strasse + Hausnummer *</span>
            <input
              name="address_line_1"
              required
              defaultValue={initialValues.address_line_1}
              className="w-full rounded-xl border px-3 py-2 text-sm"
            />
          </label>

          <label className="space-y-1 sm:col-span-2">
            <span className="text-sm font-medium">Adresszusatz</span>
            <input
              name="address_line_2"
              defaultValue={initialValues.address_line_2}
              className="w-full rounded-xl border px-3 py-2 text-sm"
              placeholder="Optional"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium">PLZ *</span>
            <input
              name="postal_code"
              required
              defaultValue={initialValues.postal_code}
              className="w-full rounded-xl border px-3 py-2 text-sm"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium">Ort *</span>
            <input
              name="city"
              required
              defaultValue={initialValues.city}
              className="w-full rounded-xl border px-3 py-2 text-sm"
            />
          </label>

          <label className="space-y-1 sm:col-span-2">
            <span className="text-sm font-medium">Land *</span>
            <input
              name="country"
              required
              defaultValue={initialValues.country}
              className="w-full rounded-xl border px-3 py-2 text-sm"
              placeholder="Deutschland"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium">Steuernummer</span>
            <input
              name="tax_number"
              defaultValue={initialValues.tax_number}
              className="w-full rounded-xl border px-3 py-2 text-sm"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium">USt-ID</span>
            <input
              name="vat_id"
              defaultValue={initialValues.vat_id}
              className="w-full rounded-xl border px-3 py-2 text-sm"
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

      <section className="space-y-4 rounded-2xl border p-4">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">Zahlungsinformationen</h2>
          <p className="text-sm text-muted-foreground">
            Waehle aus, wohin spaetere Auszahlungen gesendet werden sollen.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 sm:col-span-2">
          <span className="text-sm font-medium">Auszahlungsmethode *</span>
          <select
            name="payout_method"
            value={payoutMethod}
            onChange={(event) => setPayoutMethod(event.target.value as ProviderPayoutMethod)}
            className="w-full rounded-xl border px-3 py-2 text-sm"
          >
            <option value="iban">Bankkonto / SEPA</option>
            <option value="paypal">PayPal</option>
          </select>
        </label>

        {payoutMethod === "iban" ? (
          <label className="space-y-1 sm:col-span-2">
            <span className="text-sm font-medium">IBAN *</span>
            <input
              name="iban"
              required={!initialValues.iban_last4}
              autoComplete="off"
              inputMode="text"
              className="w-full rounded-xl border px-3 py-2 text-sm"
              placeholder="DE12 3456 7890 1234 5678 90"
            />
            <span className="block text-xs text-muted-foreground">
              Die IBAN wird aktuell nur fuer die spaetere Payout-V2-Nutzung vorbereitet und im Dashboard nur maskiert
              gespeichert bzw. angezeigt. Wenn bereits eine IBAN hinterlegt ist, kannst du das Feld leer lassen.
            </span>
            {maskedIban ? (
              <span className="block text-xs text-muted-foreground">Bereits hinterlegt: {maskedIban}</span>
            ) : null}
          </label>
        ) : (
          <label className="space-y-1 sm:col-span-2">
            <span className="text-sm font-medium">PayPal-E-Mail *</span>
            <input
              type="email"
              name="paypal_email"
              required
              defaultValue={initialValues.paypal_email}
              className="w-full rounded-xl border px-3 py-2 text-sm"
              placeholder="name@example.com"
            />
            {maskedPaypalEmail ? (
              <span className="block text-xs text-muted-foreground">Bereits hinterlegt: {maskedPaypalEmail}</span>
            ) : null}
          </label>
        )}
      </div>
      </section>

      <section className="space-y-4 rounded-2xl border p-4">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">Angaben fuer spaetere automatische Auszahlungen</h2>
          <p className="text-sm text-muted-foreground">
            Zusaetzliche Angaben, die nicht bereits oben abgefragt wurden.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 sm:col-span-2">
            <span className="text-sm font-medium">Rechtsform</span>
            <select
              name="legal_entity_type"
              defaultValue={initialValues.legal_entity_type}
              className="w-full rounded-xl border px-3 py-2 text-sm"
            >
              <option value="">Keine Angabe</option>
              <option value="individual">Einzelperson</option>
              <option value="company">Unternehmen</option>
              <option value="nonprofit">Gemeinnuetzig / Non-Profit</option>
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium">Geburtsdatum</span>
            <input
              type="date"
              name="representative_birth_date"
              defaultValue={initialValues.representative_birth_date}
              className="w-full rounded-xl border px-3 py-2 text-sm"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium">Telefon</span>
            <input
              name="representative_phone"
              defaultValue={initialValues.representative_phone}
              className="w-full rounded-xl border px-3 py-2 text-sm"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium">Business Type</span>
            <input
              name="business_type"
              defaultValue={initialValues.business_type}
              className="w-full rounded-xl border px-3 py-2 text-sm"
              placeholder="Optional"
            />
          </label>

          <label className="space-y-1 sm:col-span-2">
            <span className="text-sm font-medium">Website / Profil-URL</span>
            <input
              name="business_profile_url"
              defaultValue={initialValues.business_profile_url}
              className="w-full rounded-xl border px-3 py-2 text-sm"
              placeholder="Optional"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium">MCC</span>
            <input
              name="business_profile_mcc"
              defaultValue={initialValues.business_profile_mcc}
              className="w-full rounded-xl border px-3 py-2 text-sm"
              placeholder="Optional"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium">Produktbeschreibung</span>
            <input
              name="business_profile_product_description"
              defaultValue={initialValues.business_profile_product_description}
              className="w-full rounded-xl border px-3 py-2 text-sm"
              placeholder="Optional"
            />
          </label>
        </div>
      </section>

      <label className="flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm">
        <input
          type="checkbox"
          name="data_transfer_consent"
          required
          defaultChecked={initialValues.consentAccepted}
          className="mt-1 h-4 w-4 rounded border"
        />
        <span>
          Ich stimme zu, dass RESER die fuer Buchungen, Zahlungen, Auszahlungen und Belege notwendigen Informationen
          an die jeweils eingebundenen Zahlungsdienstleister weitergeben darf.{" "}
          <Link href="/zahlungsdienstleister" className="font-medium underline underline-offset-4">
            Mehr Informationen
          </Link>
        </span>
      </label>

      <div className="rounded-2xl border bg-slate-50 px-4 py-3 text-sm text-slate-700">
        Die automatische Zahlungsabwicklung wird schrittweise aktiviert. Deine Angaben werden gespeichert und spaeter
        fuer Auszahlungen und Belege verwendet.
      </div>

      {state.error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      ) : null}

      {state.success ? (
        <p className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          {state.success}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Speichert..." : "Auszahlungsprofil speichern"}
      </button>
    </form>
  );
}
