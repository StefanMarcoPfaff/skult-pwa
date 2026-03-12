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

export type CourseFormValues = {
  title?: string;
  location?: string;
  description?: string;
  weekday?: string;
  start_date?: string;
  start_time?: string;
  duration_minutes?: string;
  recurrence_type?: string;
  trial_mode?: string;
  capacity?: string;
  price_eur?: string;
  currency?: string;
};

function getWeekdayForDate(value: string): number | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;

  const candidate = new Date(year, month - 1, day);
  if (
    candidate.getFullYear() !== year ||
    candidate.getMonth() !== month - 1 ||
    candidate.getDate() !== day
  ) {
    return null;
  }

  return candidate.getDay();
}

export default function CourseForm({
  initialValues,
  submitActionOverride,
  submitLabel = "Kurs erstellen",
}: {
  initialValues?: CourseFormValues;
  submitActionOverride?: (formData: FormData) => Promise<{ error?: string } | void>;
  submitLabel?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const submitAction = (formData: FormData) => {
    const title = String(formData.get("title") ?? "").trim();
    const weekday = String(formData.get("weekday") ?? "").trim();
    const startDate = String(formData.get("start_date") ?? "").trim();
    const startTime = String(formData.get("start_time") ?? "").trim();
    const duration = String(formData.get("duration_minutes") ?? "").trim();
    const recurrence = String(formData.get("recurrence_type") ?? "").trim();
    const trialMode = String(formData.get("trial_mode") ?? "all_sessions").trim();

    if (!title) {
      setError("Bitte gib einen Titel ein.");
      return;
    }
    if (!weekday) {
      setError("Bitte wähle einen Wochentag.");
      return;
    }
    if (!startDate) {
      setError("Bitte wähle ein Startdatum für den Kurs.");
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
      setError("Bitte wähle einen Rhythmus.");
      return;
    }
    if (trialMode !== "all_sessions" && trialMode !== "manual") {
      setError("Bitte wähle eine gültige Probestunden-Regel.");
      return;
    }

    const selectedWeekday = Number(weekday);
    const startDateWeekday = getWeekdayForDate(startDate);
    if (!Number.isInteger(selectedWeekday) || startDateWeekday === null) {
      setError("Bitte wähle ein gültiges Startdatum für den Kurs.");
      return;
    }
    if (selectedWeekday !== startDateWeekday) {
      setError("Das Startdatum muss zum gewählten Wochentag passen.");
      return;
    }

    const priceEurRaw = String(formData.get("price_eur") ?? "").trim();
    if (priceEurRaw) {
      const parsed = Number(priceEurRaw.replace(",", "."));
      if (!Number.isFinite(parsed) || parsed < 0) {
        setError("Bitte gib einen gültigen Preis >= 0 ein.");
        return;
      }
      formData.set("price_cents", String(Math.round(parsed * 100)));
    } else {
      formData.delete("price_cents");
    }

    setError(null);
    startTransition(async () => {
      const action = submitActionOverride ?? createCourseAction;
      const result = await action(formData);
      if (result?.error) {
        setError(result.error);
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
            defaultValue={initialValues?.title ?? ""}
            className="w-full rounded-xl border px-3 py-2 text-sm"
            placeholder="z. B. Töpfern Basics"
          />
        </label>

        <label className="space-y-1">
          <span className="text-sm font-medium">Ort</span>
          <input
            name="location"
            defaultValue={initialValues?.location ?? ""}
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
          defaultValue={initialValues?.description ?? ""}
          className="w-full rounded-xl border px-3 py-2 text-sm"
          placeholder="Kurzbeschreibung für den Kurs."
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-sm font-medium">Wochentag *</span>
          <select
            name="weekday"
            required
            defaultValue={initialValues?.weekday ?? "1"}
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
          <span className="text-sm font-medium">Startdatum des Kurses *</span>
          <input
            type="date"
            name="start_date"
            required
            defaultValue={initialValues?.start_date ?? ""}
            className="w-full rounded-xl border px-3 py-2 text-sm"
          />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-sm font-medium">Startzeit *</span>
          <input
            type="time"
            name="start_time"
            required
            defaultValue={initialValues?.start_time ?? "18:00"}
            className="w-full rounded-xl border px-3 py-2 text-sm"
          />
        </label>

        <label className="space-y-1">
          <span className="text-sm font-medium">Dauer (Minuten) *</span>
          <input
            type="number"
            name="duration_minutes"
            min={1}
            required
            defaultValue={initialValues?.duration_minutes ?? "90"}
            className="w-full rounded-xl border px-3 py-2 text-sm"
          />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-sm font-medium">Rhythmus *</span>
          <select
            name="recurrence_type"
            required
            defaultValue={initialValues?.recurrence_type ?? "weekly"}
            className="w-full rounded-xl border px-3 py-2 text-sm"
          >
            <option value="weekly">Wöchentlich</option>
            <option value="biweekly">14-tägig</option>
            <option value="monthly">Monatlich</option>
          </select>
          <span className="block text-xs text-muted-foreground">
            Das Startdatum ist der Anker für den Rhythmus und muss zum Wochentag passen.
          </span>
        </label>

        <label className="space-y-1 block">
          <span className="text-sm font-medium">Probestunden-Regel *</span>
          <select
            name="trial_mode"
            required
            defaultValue={initialValues?.trial_mode ?? "all_sessions"}
            className="w-full rounded-xl border px-3 py-2 text-sm"
          >
            <option value="all_sessions">
              Probeschüler*innen können an jedem Termin teilnehmen
            </option>
            <option value="manual">
              Probeschüler*innen können nur an ausgewählten Terminen teilnehmen
            </option>
          </select>
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="space-y-1 sm:col-span-1">
          <span className="text-sm font-medium">Kapazität</span>
          <input
            type="number"
            name="capacity"
            min={1}
            defaultValue={initialValues?.capacity ?? ""}
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
            defaultValue={initialValues?.price_eur ?? ""}
            className="w-full rounded-xl border px-3 py-2 text-sm"
            placeholder="0.00"
          />
          <span className="block text-xs text-muted-foreground">
            Wird intern in Cent gespeichert.
          </span>
        </label>

        <label className="space-y-1 sm:col-span-1">
          <span className="text-sm font-medium">Währung *</span>
          <input
            name="currency"
            required
            defaultValue={initialValues?.currency ?? "EUR"}
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
        {pending ? "Speichert..." : submitLabel}
      </button>
    </form>
  );
}
