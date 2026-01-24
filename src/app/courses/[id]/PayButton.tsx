"use client";

import { useState } from "react";

export function PayButton({ courseId, disabled }: { courseId: string; disabled?: boolean }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function startCheckout() {
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ courseId }),
      });

      // Immer erst text lesen, dann JSON versuchen
      const text = await res.text();
      let data: any = null;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(text.slice(0, 120) || "Antwort war kein JSON");
      }

      if (!res.ok) throw new Error(data?.error || "Checkout fehlgeschlagen");
      if (!data?.url) throw new Error("Stripe URL fehlt");

      window.location.href = data.url;
    } catch (e: any) {
      setErr(e?.message || "Fehler");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        onClick={startCheckout}
        disabled={disabled || loading}
        className={`w-full rounded-2xl py-4 text-lg font-bold ${
          disabled || loading ? "bg-gray-200 text-gray-500" : "bg-black text-white"
        }`}
      >
        {loading ? "Weiterleitung..." : "Jetzt kostenpflichtig buchen"}
      </button>

      {err && <p className="text-sm text-red-600">{err}</p>}
    </div>
  );
}
