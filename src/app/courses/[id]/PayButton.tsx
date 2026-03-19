"use client";

import { useState } from "react";

export function PayButton({ courseId, disabled }: { courseId: string; disabled?: boolean }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
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
    form.phone.trim();

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
        Nach der Zahlung erhaeltst du deine Buchungsbestaetigung und dein Workshop-Ticket per E-Mail.
      </p>

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
