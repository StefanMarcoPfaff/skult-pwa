"use client";

import Link from "next/link";
import { useState } from "react";
import { LEGAL_LINKS } from "@/lib/legal";

type PayButtonProps = {
  courseId: string;
  teacherName?: string | null;
  priceLabel?: string | null;
  stornoPolicyLabel?: string | null;
  disabled?: boolean;
};

export function PayButton({
  courseId,
  teacherName,
  priceLabel,
  stornoPolicyLabel,
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
    agbAccepted: false,
    privacyAccepted: false,
    workshopStornoAccepted: false,
  });

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
          agbAccepted: consents.agbAccepted,
          privacyAccepted: consents.privacyAccepted,
          workshopStornoAccepted: consents.workshopStornoAccepted,
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
      if (!data?.url) throw new Error("Stripe URL fehlt");

      window.location.href = data.url;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Fehler";
      setErr(message);
    } finally {
      setLoading(false);
    }
  }

  const isComplete =
    form.firstName.trim() &&
    form.lastName.trim() &&
    form.email.trim() &&
    form.phone.trim() &&
    consents.agbAccepted &&
    consents.privacyAccepted &&
    consents.workshopStornoAccepted;

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

      <p className="text-sm text-muted-foreground">
        Im Checkout stehen dir aktuell Karte und SEPA-Lastschrift zur Verfügung. Nach der Zahlung
        erhältst du deine Buchungsbestätigung und dein Workshop-Ticket per E-Mail.
      </p>

      <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
        <h3 className="font-semibold text-foreground">Buchungsübersicht</h3>
        <div className="mt-3 space-y-2 text-muted-foreground">
          {priceLabel ? (
            <p>
              Preis: <span className="font-medium text-foreground">{priceLabel}</span>
            </p>
          ) : null}
          {teacherName ? (
            <p>
              Dozent: <span className="font-medium text-foreground">{teacherName}</span>
            </p>
          ) : null}
          <p>
            Stornierungsbedingungen:{" "}
            <span className="font-medium text-foreground">
              {stornoPolicyLabel ?? "Es gelten die individuell festgelegten Bedingungen des Dozenten"}
            </span>
          </p>
        </div>
      </section>

      <div className="space-y-3 rounded-xl border p-4 text-sm">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={consents.agbAccepted}
            onChange={(event) =>
              setConsents((current) => ({ ...current, agbAccepted: event.target.checked }))
            }
            className="mt-1"
          />
          <span>
            Ich akzeptiere die{" "}
            <Link href={LEGAL_LINKS.agb} target="_blank" className="underline underline-offset-4">
              AGB
            </Link>
            .
          </span>
        </label>

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={consents.privacyAccepted}
            onChange={(event) =>
              setConsents((current) => ({ ...current, privacyAccepted: event.target.checked }))
            }
            className="mt-1"
          />
          <span>
            Ich habe die{" "}
            <Link href={LEGAL_LINKS.privacy} target="_blank" className="underline underline-offset-4">
              Datenschutzerklärung
            </Link>{" "}
            zur Kenntnis genommen.
          </span>
        </label>

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={consents.workshopStornoAccepted}
            onChange={(event) =>
              setConsents((current) => ({
                ...current,
                workshopStornoAccepted: event.target.checked,
              }))
            }
            className="mt-1"
          />
          <span>
            Ich habe die Stornierungs- bzw. Kündigungsbedingungen gelesen und akzeptiere diese sowie den{" "}
            <Link
              href={LEGAL_LINKS.workshopStorno}
              target="_blank"
              className="underline underline-offset-4"
            >
              rechtlichen Hinweis zur Workshop-Stornierung
            </Link>
            .
          </span>
        </label>

        <p className="text-xs text-muted-foreground">
          Die verlinkten Rechtstexte sind aktuell als MVP-Platzhalter vorbereitet und werden
          später durch finale juristische Inhalte ersetzt.
        </p>
      </div>

      <button
        onClick={startCheckout}
        disabled={disabled || loading || !isComplete}
        className={`w-full rounded-2xl py-4 text-lg font-bold ${
          disabled || loading || !isComplete ? "bg-gray-200 text-gray-500" : "bg-black text-white"
        }`}
      >
        {loading ? "Weiterleitung..." : "Jetzt kostenpflichtig buchen"}
      </button>

      {err ? <p className="text-sm text-red-600">{err}</p> : null}
    </div>
  );
}
