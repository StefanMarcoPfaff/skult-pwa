"use client";

import Link from "next/link";
import { useState } from "react";
import { LEGAL_LINKS } from "@/lib/legal";

type PayButtonProps = {
  courseId: string;
  priceLabel?: string | null;
  stornoPolicyLabel?: string | null;
  showCancellationTerms?: boolean;
  maxGuestCountPerBooking?: number;
  disabled?: boolean;
};

type GuestForm = {
  firstName: string;
  lastName: string;
  email: string;
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
  maxGuestCountPerBooking = 0,
  disabled,
}: PayButtonProps) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    billingName: "",
    billingStreet: "",
    billingHouseNumber: "",
    billingPostalCode: "",
    billingCity: "",
    billingCountry: "",
  });
  const [consents, setConsents] = useState({
    termsAndPrivacyAccepted: false,
    workshopStornoAccepted: false,
  });
  const [guestCount, setGuestCount] = useState(0);
  const [guests, setGuests] = useState<GuestForm[]>([]);

  const isFreeOffer = priceLabel === "Kostenlos" || priceLabel === "Kostenfreie Reservierung";
  const cancellationLabel = stornoPolicyLabel?.trim() || null;
  const cancellationRequired = showCancellationTerms && Boolean(cancellationLabel);
  const normalizedMaxGuestCount = Math.max(0, Math.trunc(maxGuestCountPerBooking));
  const selectedGuests = guests.slice(0, guestCount);
  const canSubmit =
    Boolean(form.firstName.trim()) &&
    Boolean(form.lastName.trim()) &&
    Boolean(form.email.trim()) &&
    Boolean(form.phone.trim()) &&
    selectedGuests.every((guest) => guest.firstName.trim() && guest.lastName.trim()) &&
    consents.termsAndPrivacyAccepted &&
    (!cancellationRequired || consents.workshopStornoAccepted);

  function updateGuestCount(nextCount: number) {
    const boundedCount = Math.max(0, Math.min(normalizedMaxGuestCount, nextCount));
    setGuestCount(boundedCount);
    setGuests((current) =>
      Array.from({ length: boundedCount }, (_, index) => current[index] ?? { firstName: "", lastName: "", email: "" })
    );
  }

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
          billingAddress: isFreeOffer
            ? undefined
            : {
                name: form.billingName,
                street: form.billingStreet,
                houseNumber: form.billingHouseNumber,
                postalCode: form.billingPostalCode,
                city: form.billingCity,
                country: form.billingCountry,
              },
          guests: selectedGuests.map((guest) => ({
            firstName: guest.firstName,
            lastName: guest.lastName,
            email: guest.email,
          })),
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

      {normalizedMaxGuestCount > 0 ? (
        <div className="space-y-3 rounded-xl border p-4">
          <label className="block space-y-1">
            <span className="text-sm font-medium">Begleitpersonen</span>
            <select
              value={guestCount}
              onChange={(event) => updateGuestCount(Number(event.target.value))}
              className="w-full rounded-xl border px-3 py-2 text-sm"
            >
              {Array.from({ length: normalizedMaxGuestCount + 1 }, (_, index) => (
                <option key={index} value={index}>
                  {index}
                </option>
              ))}
            </select>
          </label>

          {selectedGuests.map((guest, index) => (
            <div key={index} className="grid gap-3 border-t pt-3 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-sm font-medium">Vorname Begleitperson {index + 1} *</span>
                <input
                  value={guest.firstName}
                  onChange={(event) =>
                    setGuests((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, firstName: event.target.value } : item
                      )
                    )
                  }
                  className="w-full rounded-xl border px-3 py-2 text-sm"
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium">Nachname Begleitperson {index + 1} *</span>
                <input
                  value={guest.lastName}
                  onChange={(event) =>
                    setGuests((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, lastName: event.target.value } : item
                      )
                    )
                  }
                  className="w-full rounded-xl border px-3 py-2 text-sm"
                />
              </label>
              <label className="space-y-1 sm:col-span-2">
                <span className="text-sm font-medium">E-Mail Begleitperson {index + 1}</span>
                <input
                  type="email"
                  value={guest.email}
                  onChange={(event) =>
                    setGuests((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, email: event.target.value } : item
                      )
                    )
                  }
                  className="w-full rounded-xl border px-3 py-2 text-sm"
                />
              </label>
            </div>
          ))}

          <p className="text-sm text-muted-foreground">Gesamtplaetze: {1 + guestCount}</p>
        </div>
      ) : null}

      {!isFreeOffer ? (
        <div className="space-y-3 rounded-xl border p-4">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold">Rechnungsadresse</h3>
            <p className="text-xs text-muted-foreground">
              Wenn du einen vollständigen Beleg für deine Unterlagen oder Buchhaltung erhalten
              möchtest, kannst du hier optional deine Rechnungsadresse angeben.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1 sm:col-span-2">
              <span className="text-sm font-medium">Name (falls abweichend)</span>
              <input
                value={form.billingName}
                onChange={(event) => setForm((current) => ({ ...current, billingName: event.target.value }))}
                className="w-full rounded-xl border px-3 py-2 text-sm"
              />
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium">Straße</span>
              <input
                value={form.billingStreet}
                onChange={(event) => setForm((current) => ({ ...current, billingStreet: event.target.value }))}
                className="w-full rounded-xl border px-3 py-2 text-sm"
              />
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium">Hausnummer</span>
              <input
                value={form.billingHouseNumber}
                onChange={(event) => setForm((current) => ({ ...current, billingHouseNumber: event.target.value }))}
                className="w-full rounded-xl border px-3 py-2 text-sm"
              />
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium">PLZ</span>
              <input
                value={form.billingPostalCode}
                onChange={(event) => setForm((current) => ({ ...current, billingPostalCode: event.target.value }))}
                className="w-full rounded-xl border px-3 py-2 text-sm"
              />
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium">Ort</span>
              <input
                value={form.billingCity}
                onChange={(event) => setForm((current) => ({ ...current, billingCity: event.target.value }))}
                className="w-full rounded-xl border px-3 py-2 text-sm"
              />
            </label>
            <label className="space-y-1 sm:col-span-2">
              <span className="text-sm font-medium">Land</span>
              <input
                value={form.billingCountry}
                onChange={(event) => setForm((current) => ({ ...current, billingCountry: event.target.value }))}
                className="w-full rounded-xl border px-3 py-2 text-sm"
              />
            </label>
          </div>
        </div>
      ) : null}

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
