"use client";

import Link from "next/link";
import { useState } from "react";
import { LEGAL_LINKS } from "@/lib/legal";

type PayButtonProps = {
  courseId: string;
  priceLabel?: string | null;
  stornoPolicyLabel?: string | null;
  showCancellationTerms?: boolean;
  disabled?: boolean;
};

type BookingConsentFieldsProps = {
  termsAndPrivacyAccepted: boolean;
  cancellationAccepted: boolean;
  cancellationLabel: string | null;
  cancellationRequired: boolean;
  onTermsAndPrivacyChange: (accepted: boolean) => void;
  onCancellationChange: (accepted: boolean) => void;
};

function BookingConsentFields({
  termsAndPrivacyAccepted,
  cancellationAccepted,
  cancellationLabel,
  cancellationRequired,
  onTermsAndPrivacyChange,
  onCancellationChange,
}: BookingConsentFieldsProps) {
  return (
    <div className="space-y-3 rounded-xl border p-4 text-sm">
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={termsAndPrivacyAccepted}
          onChange={(event) => onTermsAndPrivacyChange(event.target.checked)}
          className="mt-1"
        />
        <span>
          Ich akzeptiere die{" "}
          <Link href={LEGAL_LINKS.agb} target="_blank" className="underline underline-offset-4">
            AGB
          </Link>{" "}
          und habe die{" "}
          <Link href={LEGAL_LINKS.privacy} target="_blank" className="underline underline-offset-4">
            Datenschutzhinweise
          </Link>{" "}
          gelesen.
        </span>
      </label>

      <p className="text-xs text-muted-foreground">
        Weitere Informationen findest du im{" "}
        <Link href={LEGAL_LINKS.imprint} target="_blank" className="underline underline-offset-4">
          Impressum
        </Link>
        .
      </p>

      {cancellationRequired ? (
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={cancellationAccepted}
            onChange={(event) => onCancellationChange(event.target.checked)}
            className="mt-1"
          />
          <span>
            Ich habe die Stornierungsbedingungen
            {cancellationLabel ? <> ({cancellationLabel})</> : null} gelesen und akzeptiere diese
            sowie den{" "}
            <Link
              href={LEGAL_LINKS.workshopStorno}
              target="_blank"
              className="underline underline-offset-4"
            >
              rechtlichen Hinweis zur Stornierung einmaliger Angebote
            </Link>
            .
          </span>
        </label>
      ) : null}
    </div>
  );
}

export function PayButton({
  courseId,
  priceLabel,
  stornoPolicyLabel,
  showCancellationTerms = false,
  disabled,
}: PayButtonProps) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
  });
  const [consents, setConsents] = useState({
    termsAndPrivacyAccepted: false,
    workshopStornoAccepted: false,
  });

  const isFreeOffer = priceLabel === "Kostenlos" || priceLabel === "Kostenfreie Reservierung";
  const cancellationLabel = stornoPolicyLabel?.trim() || null;
  const cancellationRequired = showCancellationTerms && Boolean(cancellationLabel);
  const canSubmit =
    Boolean(form.firstName.trim()) &&
    Boolean(form.lastName.trim()) &&
    Boolean(form.email.trim()) &&
    Boolean(form.phone.trim()) &&
    consents.termsAndPrivacyAccepted &&
    (!cancellationRequired || consents.workshopStornoAccepted);

  async function startCheckout() {
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          courseId,
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          phone: form.phone,
          agbAccepted: consents.termsAndPrivacyAccepted,
          privacyAccepted: consents.termsAndPrivacyAccepted,
          workshopStornoAccepted: cancellationRequired ? consents.workshopStornoAccepted : true,
        }),
      });

      const text = await res.text();
      let data: { url?: string; error?: string } | null = null;
      try {
        data = JSON.parse(text) as { url?: string; error?: string };
      } catch {
        throw new Error(text.slice(0, 120) || "Antwort war kein JSON");
      }

      if (!res.ok) throw new Error(data?.error || "Checkout fehlgeschlagen");
      if (!data?.url) throw new Error("Checkout-URL fehlt");

      window.location.href = data.url;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Fehler";
      setErr(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-sm font-medium">Vorname *</span>
          <input
            value={form.firstName}
            onChange={(event) => setForm((current) => ({ ...current, firstName: event.target.value }))}
            className="w-full rounded-xl border px-3 py-2 text-sm"
          />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium">Nachname *</span>
          <input
            value={form.lastName}
            onChange={(event) => setForm((current) => ({ ...current, lastName: event.target.value }))}
            className="w-full rounded-xl border px-3 py-2 text-sm"
          />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium">E-Mail *</span>
          <input
            type="email"
            value={form.email}
            onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
            className="w-full rounded-xl border px-3 py-2 text-sm"
          />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium">Telefon *</span>
          <input
            value={form.phone}
            onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
            className="w-full rounded-xl border px-3 py-2 text-sm"
          />
        </label>
      </div>

      {isFreeOffer ? (
        <p className="text-sm text-muted-foreground">
          Dieses einmalige Angebot ist kostenlos. Deine Reservierung wird direkt bestätigt.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Im Checkout zeigt Stripe automatisch die verfügbaren Zahlungsmethoden für Gerät,
          Land und Buchung an, zum Beispiel Karte, Apple Pay, Google Pay, SEPA oder Klarna.
        </p>
      )}

      <BookingConsentFields
        termsAndPrivacyAccepted={consents.termsAndPrivacyAccepted}
        cancellationAccepted={consents.workshopStornoAccepted}
        cancellationLabel={cancellationLabel}
        cancellationRequired={cancellationRequired}
        onTermsAndPrivacyChange={(accepted) =>
          setConsents((current) => ({ ...current, termsAndPrivacyAccepted: accepted }))
        }
        onCancellationChange={(accepted) =>
          setConsents((current) => ({ ...current, workshopStornoAccepted: accepted }))
        }
      />

      <button
        onClick={startCheckout}
        disabled={disabled || loading || !canSubmit}
        className={`w-full rounded-2xl py-4 text-lg font-bold ${
          disabled || loading || !canSubmit ? "bg-gray-200 text-gray-500" : "bg-black text-white"
        }`}
      >
        {loading ? "Reservierung..." : "Jetzt reservieren"}
      </button>

      {err ? <p className="text-sm text-red-600">{err}</p> : null}
    </div>
  );
}
