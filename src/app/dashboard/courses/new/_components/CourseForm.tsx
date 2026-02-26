"use client";

import { useState, useTransition } from "react";
import { createCourseAction } from "../actions";

const weekdayOptions = [
  { value: "1", label: "Montag" },
  { value: "2", label: "Dienstag" },
  { value: "3", label: "Mittwoch" },
  { value: "4", label: "Donnerstag" },
  { value: "5", label: "Freitag" },
  { value: "6", label: "Samstag" },
  { value: "0", label: "Sonntag" },
];

export default function CourseForm() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const submitAction = (formData: FormData) => {
    const title = String(formData.get("title") ?? "").trim();
    const weekday = String(formData.get("weekday") ?? "").trim();
    const startTime = String(formData.get("start_time") ?? "").trim();
    const duration = String(formData.get("duration_minutes") ?? "").trim();
    const recurrence = String(formData.get("recurrence_type") ?? "").trim();

    if (!title) {
      setError("Bitte gib einen Titel ein.");
      return;
    }
    if (!weekday) {
      setError("Bitte waehle einen Wochentag.");
      return;
    }
    if (!startTime) {
      setError("Bitte gib eine Startzeit an.");
      return;
    }
    if (!duration) {
      setError("Bitte gib eine Dauer an.");
      return;
    }
    if (!recurrence) {
      setError("Bitte waehle einen Rhythmus.");
      return;
    }

    const priceEurRaw = String(formData.get("price_eur") ?? "").trim();
    if (priceEurRaw) {
      const parsed = Number(priceEurRaw.replace(",", "."));
      if (!Number.isFinite(parsed) || parsed < 0) {
        setError("Bitte gib einen gueltigen Preis >= 0 ein.");
        return;
      }
      formData.set("price_cents", String(Math.round(parsed * 100)));
    } else {
      formData.delete("price_cents");
    }

    setError(null);
    startTransition(async () => {
      const result = await createCourseAction(formData);
      if (typeof result === "string" && result) {
        setError(result);
      }
    });
  };

  return (
    <form action={submitAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-sm font-medium">Titel *</span>
          <input
            name="title"
            required
            className="w-full rounded-xl border px-3 py-2 text-sm"
            placeholder="z. B. Toepfern Basics"
          />
        </label>

        <label className="space-y-1">
          <span className="text-sm font-medium">Ort</span>
          <input
            name="location"
            className="w-full rounded-xl border px-3 py-2 text-sm"
            placeholder="z. B. Atelier West"
          />
        </label>
      </div>

      <label className="space-y-1 block">
        <span className="text-sm font-medium">Beschreibung</span>
        <textarea
          name="description"
          rows={4}
          className="w-full rounded-xl border px-3 py-2 text-sm"
          placeholder="Kurzbeschreibung fuer den Kurs."
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-sm font-medium">Wochentag *</span>
          <select
            name="weekday"
            required
            defaultValue="1"
            className="w-full rounded-xl border px-3 py-2 text-sm"
          >
            {weekdayOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-sm font-medium">Startzeit *</span>
          <input
            type="time"
            name="start_time"
            required
            defaultValue="18:00"
            className="w-full rounded-xl border px-3 py-2 text-sm"
          />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-sm font-medium">Dauer (Minuten) *</span>
          <input
            type="number"
            name="duration_minutes"
            min={1}
            required
            defaultValue={90}
            className="w-full rounded-xl border px-3 py-2 text-sm"
          />
        </label>

        <label className="space-y-1">
          <span className="text-sm font-medium">Rhythmus *</span>
          <select
            name="recurrence_type"
            required
            defaultValue="weekly"
            className="w-full rounded-xl border px-3 py-2 text-sm"
          >
            <option value="weekly">Woechentlich</option>
            <option value="biweekly">14-taegig</option>
            <option value="monthly">Monatlich</option>
          </select>
          <span className="block text-xs text-muted-foreground">
            Der erste Termin wird automatisch als naechste passende Woche berechnet.
          </span>
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="space-y-1 sm:col-span-1">
          <span className="text-sm font-medium">Kapazitaet</span>
          <input
            type="number"
            name="capacity"
            min={1}
            className="w-full rounded-xl border px-3 py-2 text-sm"
            placeholder="10"
          />
        </label>

        <label className="space-y-1 sm:col-span-1">
          <span className="text-sm font-medium">Preis (EUR)</span>
          <input
            type="number"
            name="price_eur"
            min={0}
            step="0.01"
            inputMode="decimal"
            className="w-full rounded-xl border px-3 py-2 text-sm"
            placeholder="0.00"
          />
          <span className="block text-xs text-muted-foreground">
            Wird intern in Cent gespeichert.
          </span>
        </label>

        <label className="space-y-1 sm:col-span-1">
          <span className="text-sm font-medium">Waehrung *</span>
          <input
            name="currency"
            required
            defaultValue="EUR"
            className="w-full rounded-xl border px-3 py-2 text-sm uppercase"
          />
        </label>
      </div>

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Speichert..." : "Kurs erstellen"}
      </button>
    </form>
  );
}
