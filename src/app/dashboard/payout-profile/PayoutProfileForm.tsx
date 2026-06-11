"use client";

import { useState, useTransition } from "react";
import {
  PROVIDER_BILLING_VAT_STATUSES,
  type ProviderBillingVatStatus,
} from "@/lib/provider-billing-profile";
import {
  maskEmail,
  maskIbanLast4,
  type ProviderPayoutMethod,
} from "@/lib/payout-profile";
import { savePayoutProfileAction, type SavePayoutProfileState } from "./actions";

type PayoutProfileFormProps = {
  initialValues: {
    account_holder_name: string;
    address: string;
    payout_method: ProviderPayoutMethod;
    iban_last4: string;
    paypal_email: string;
    tax_number: string;
    vat_id: string;
    vat_status: ProviderBillingVatStatus | "";
    consentAccepted: boolean;
    verification_status: string;
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
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 sm:col-span-2">
          <span className="text-sm font-medium">Name / Firma *</span>
          <input
            name="account_holder_name"
            required
            defaultValue={initialValues.account_holder_name}
            className="w-full rounded-xl border px-3 py-2 text-sm"
            placeholder="z. B. Max Mustermann oder Studio Nord"
          />
        </label>

        <label className="space-y-1 sm:col-span-2">
          <span className="text-sm font-medium">Adresse *</span>
          <textarea
            name="address"
            required
            rows={4}
            defaultValue={initialValues.address}
            className="w-full rounded-xl border px-3 py-2 text-sm"
            placeholder={"Strasse 1\n12345 Musterstadt\nDeutschland"}
          />
        </label>

        <label className="space-y-1 sm:col-span-2">
          <span className="text-sm font-medium">Auszahlungsmethode *</span>
          <select
            name="payout_method"
            value={payoutMethod}
            onChange={(event) => setPayoutMethod(event.target.value as ProviderPayoutMethod)}
            className="w-full rounded-xl border px-3 py-2 text-sm"
          >
            <option value="iban">IBAN</option>
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

      <label className="flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm">
        <input
          type="checkbox"
          name="data_transfer_consent"
          required
          defaultChecked={initialValues.consentAccepted}
          className="mt-1 h-4 w-4 rounded border"
        />
        <span>
          Ich stimme zu, dass RESER meine fuer die Zahlungsabwicklung erforderlichen Daten an den jeweiligen
          Zahlungsdienstleister weitergeben darf.
        </span>
      </label>

      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Keine echten Auszahlungen. Keine PayPal-API. Keine Bank-API. Keine Mollie-Integration. Dieses Profil speichert
        nur die bevorzugte Auszahlungsmethode fuer spaetere Payment-V2-Payouts.
      </div>

      <div className="rounded-2xl border bg-slate-50 px-4 py-3 text-sm text-slate-700">
        Verifizierungsstatus: <span className="font-medium">{initialValues.verification_status}</span>
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
