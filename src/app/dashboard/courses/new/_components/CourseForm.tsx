"use client";

import { useMemo, useState, useTransition } from "react";
import { buildTrialSlot } from "@/app/courses/[id]/trial-slots";
import { generateRecurringCourseSessions } from "@/lib/course-sessions";
import { calculateCoursePriceBreakdown } from "@/lib/course-pricing";
import { getPlatformFeePercent } from "@/lib/platform-fees";
import type { ProviderType } from "@/lib/provider-profiles";
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
  location_details?: string;
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
  instructor_name?: string;
  trial_slot_starts?: string[];
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

function parsePriceToCents(value: string): number {
  const parsed = Number(value.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.round(parsed * 100);
}

function formatCurrency(cents: number, currency: string): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: currency || "EUR",
  }).format(cents / 100);
}

function combineCourseStartsAtISO(startDate: string, startTime: string): string | null {
  if (!startDate || !startTime) return null;

  const [year, month, day] = startDate.split("-").map(Number);
  const [hour, minute] = startTime.split(":").map(Number);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute)
  ) {
    return null;
  }

  return new Date(year, month - 1, day, hour, minute, 0, 0).toISOString();
}

export default function CourseForm({
  initialValues,
  submitActionOverride,
  submitLabel = "Kurs erstellen",
  providerType,
  providerDisplayName,
}: {
  initialValues?: CourseFormValues;
  submitActionOverride?: (formData: FormData) => Promise<{ error?: string } | void>;
  submitLabel?: string;
  providerType: ProviderType;
  providerDisplayName: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [priceEur, setPriceEur] = useState(initialValues?.price_eur ?? "");
  const [currency, setCurrency] = useState(initialValues?.currency ?? "EUR");
  const [weekday, setWeekday] = useState(initialValues?.weekday ?? "1");
  const [startDate, setStartDate] = useState(initialValues?.start_date ?? "");
  const [startTime, setStartTime] = useState(initialValues?.start_time ?? "18:00");
  const [durationMinutes, setDurationMinutes] = useState(initialValues?.duration_minutes ?? "90");
  const [recurrenceType, setRecurrenceType] = useState(initialValues?.recurrence_type ?? "weekly");
  const [trialMode, setTrialMode] = useState(initialValues?.trial_mode ?? "all_sessions");
  const [selectedTrialStarts, setSelectedTrialStarts] = useState<string[]>(
    initialValues?.trial_slot_starts ?? []
  );

  const platformFeePercent = getPlatformFeePercent(providerType);
  const priceBreakdown = calculateCoursePriceBreakdown(parsePriceToCents(priceEur), providerType);
  const availableManualTrialSlots = useMemo(() => {
    const startsAt = combineCourseStartsAtISO(startDate, startTime);
    const weekdayValue = Number(weekday);
    const durationValue = Number(durationMinutes);

    if (
      !startsAt ||
      !Number.isInteger(weekdayValue) ||
      !Number.isFinite(durationValue) ||
      durationValue <= 0
    ) {
      return [];
    }

    const fromDate = new Date(startsAt);
    const untilDate = new Date(fromDate);
    untilDate.setMonth(untilDate.getMonth() + 6);

    return generateRecurringCourseSessions({
      starts_at: startsAt,
      weekday: weekdayValue,
      start_time: startTime,
      duration_minutes: durationValue,
      recurrence_type: recurrenceType,
      fromDate,
      untilDate,
      limit: 12,
    })
      .map((occurrence) => buildTrialSlot(occurrence.starts_at, occurrence.ends_at))
      .filter((slot): slot is NonNullable<ReturnType<typeof buildTrialSlot>> => slot !== null);
  }, [durationMinutes, recurrenceType, startDate, startTime, weekday]);

  const selectedTrialStartSet = useMemo(() => new Set(selectedTrialStarts), [selectedTrialStarts]);

  const submitAction = (formData: FormData) => {
    const title = String(formData.get("title") ?? "").trim();
    const weekdayValue = String(formData.get("weekday") ?? "").trim();
    const startDateValue = String(formData.get("start_date") ?? "").trim();
    const startTimeValue = String(formData.get("start_time") ?? "").trim();
    const duration = String(formData.get("duration_minutes") ?? "").trim();
    const recurrence = String(formData.get("recurrence_type") ?? "").trim();
    const trialModeValue = String(formData.get("trial_mode") ?? "all_sessions").trim();
    const instructorName = String(formData.get("instructor_name") ?? "").trim();

    if (!title) {
      setError("Bitte gib einen Titel ein.");
      return;
    }
    if (!weekdayValue) {
      setError("Bitte wähle einen Wochentag.");
      return;
    }
    if (!startDateValue) {
      setError("Bitte wähle ein Startdatum für den Kurs.");
      return;
    }
    if (!startTimeValue) {
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
    if (trialModeValue !== "all_sessions" && trialModeValue !== "manual") {
      setError("Bitte wähle eine gültige Probestunden-Regel.");
      return;
    }
    if (trialModeValue === "manual" && selectedTrialStarts.length === 0) {
      setError("Bitte wähle mindestens einen Termin für Probestunden aus.");
      return;
    }
    if (providerType === "studio_provider" && !instructorName) {
      setError("Bitte gib den Dozenten für diesen Kurs an.");
      return;
    }

    const selectedWeekday = Number(weekdayValue);
    const startDateWeekday = getWeekdayForDate(startDateValue);
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

      <label className="block space-y-1">
        <span className="text-sm font-medium">Raum / Zusatzinfo zum Ort</span>
        <input
          name="location_details"
          defaultValue={initialValues?.location_details ?? ""}
          className="w-full rounded-xl border px-3 py-2 text-sm"
          placeholder="z. B. Raumname, Stockwerk, Klingelhinweis oder Treffpunkt"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium">Beschreibung</span>
        <textarea
          name="description"
          rows={4}
          defaultValue={initialValues?.description ?? ""}
          className="w-full rounded-xl border px-3 py-2 text-sm"
          placeholder="Kurzbeschreibung für den Kurs."
        />
      </label>

      {providerType === "studio_provider" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-sm font-medium">Anbieter:</span>
            <input
              value={providerDisplayName}
              readOnly
              className="w-full rounded-xl border bg-gray-50 px-3 py-2 text-sm text-gray-700"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium">Dozent: *</span>
            <input
              name="instructor_name"
              required
              defaultValue={initialValues?.instructor_name ?? ""}
              className="w-full rounded-xl border px-3 py-2 text-sm"
              placeholder="Name der Kursleitung"
            />
          </label>
        </div>
      ) : (
        <label className="block space-y-1">
          <span className="text-sm font-medium">Dozent:</span>
          <input
            name="instructor_name"
            value={providerDisplayName}
            readOnly
            className="w-full rounded-xl border bg-gray-50 px-3 py-2 text-sm text-gray-700"
          />
        </label>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-sm font-medium">Wochentag *</span>
          <select
            name="weekday"
            required
            value={weekday}
            onChange={(event) => setWeekday(event.target.value)}
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
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
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
            value={startTime}
            onChange={(event) => setStartTime(event.target.value)}
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
            value={durationMinutes}
            onChange={(event) => setDurationMinutes(event.target.value)}
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
            value={recurrenceType}
            onChange={(event) => setRecurrenceType(event.target.value)}
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

        <label className="block space-y-1">
          <span className="text-sm font-medium">Probestunden-Regel *</span>
          <select
            name="trial_mode"
            required
            value={trialMode}
            onChange={(event) => setTrialMode(event.target.value)}
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

      {trialMode === "manual" ? (
        <section className="rounded-2xl border bg-gray-50 p-4 text-sm">
          <p className="font-medium">Termine für Probestunden</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Wähle aus, an welchen der kommenden Kurstermine Probeschüler*innen teilnehmen dürfen.
          </p>
          {availableManualTrialSlots.length > 0 ? (
            <div className="mt-3 space-y-2">
              {availableManualTrialSlots.map((slot) => {
                const checked = selectedTrialStartSet.has(slot.startsAt);
                return (
                  <label
                    key={slot.startsAt}
                    className="flex items-center gap-3 rounded-xl border bg-white px-3 py-2"
                  >
                    <input
                      type="checkbox"
                      name="trial_slot_starts_at"
                      value={slot.startsAt}
                      checked={checked}
                      onChange={(event) =>
                        setSelectedTrialStarts((prev) =>
                          event.target.checked
                            ? [...prev, slot.startsAt]
                            : prev.filter((value) => value !== slot.startsAt)
                        )
                      }
                    />
                    <span>{slot.label}</span>
                  </label>
                );
              })}
            </div>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">
              Sobald Kursstart, Wochentag, Startzeit, Dauer und Rhythmus gültig gesetzt sind,
              erscheinen hier die auswählbaren Kurstermine.
            </p>
          )}
        </section>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
        <h2 className="font-medium text-foreground">Hinweis</h2>
        <p className="mt-2 text-muted-foreground">
          Dieser Kurs ist fortlaufend. Du kannst den Kurs später in deinem Profil pausieren oder
          stoppen.
        </p>
      </section>

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
          <span className="text-sm font-medium">Preis pro Monat (EUR)</span>
          <input
            type="number"
            name="price_eur"
            min={0}
            step="0.01"
            inputMode="decimal"
            value={priceEur}
            onChange={(event) => setPriceEur(event.target.value)}
            className="w-full rounded-xl border px-3 py-2 text-sm"
            placeholder="0.00"
          />
          <span className="block text-xs text-muted-foreground">
            Wiederkehrender Monatsbeitrag. Wird intern in Cent gespeichert.
          </span>
        </label>

        <label className="space-y-1 sm:col-span-1">
          <span className="text-sm font-medium">Währung *</span>
          <input
            name="currency"
            required
            value={currency}
            onChange={(event) => setCurrency(event.target.value)}
            className="w-full rounded-xl border px-3 py-2 text-sm uppercase"
          />
        </label>
      </div>

      <div className="rounded-2xl border bg-gray-50 p-4 text-sm">
        <p className="font-medium">Preisaufteilung</p>
        <div className="mt-3 space-y-1 text-muted-foreground">
          <div className="flex items-center justify-between gap-4">
            <span>Kurspreis pro Monat</span>
            <span>{formatCurrency(priceBreakdown.grossCents, currency)}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span>Plattformgebühr ({platformFeePercent} %)</span>
            <span>{formatCurrency(priceBreakdown.platformFeeCents, currency)}</span>
          </div>
          <div className="flex items-center justify-between gap-4 font-medium text-foreground">
            <span>Voraussichtliche Auszahlung pro Kund*in / Monat</span>
            <span>{formatCurrency(priceBreakdown.payoutCents, currency)}</span>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Die voraussichtliche Auszahlung pro Monat berechnet sich aus dem Monatsbeitrag abzüglich
          der Plattformgebühr von {platformFeePercent} %.
        </p>
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
