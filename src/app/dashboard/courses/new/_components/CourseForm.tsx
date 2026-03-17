"use client";

import { useState, useTransition } from "react";
import { calculateCoursePriceBreakdown, STRIPE_ESTIMATE_FIXED_FEE_CENTS, STRIPE_ESTIMATE_PERCENT } from "@/lib/course-pricing";
import type { CancellationModel, ProviderType } from "@/lib/provider-profiles";
import { STRIPE_PLATFORM_FEE_PERCENT } from "@/lib/stripe-connect";
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

const cancellationOptions: Array<{ value: CancellationModel; label: string }> = [
  { value: "monthly", label: "Monatlich kuendbar" },
  { value: "quarterly", label: "Vierteljaehrlich kuendbar" },
  { value: "semiannual", label: "Halbjaehrlich kuendbar" },
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
  cancellation_model?: CancellationModel;
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

  const priceBreakdown = calculateCoursePriceBreakdown(parsePriceToCents(priceEur));

  const submitAction = (formData: FormData) => {
    const title = String(formData.get("title") ?? "").trim();
    const weekday = String(formData.get("weekday") ?? "").trim();
    const startDate = String(formData.get("start_date") ?? "").trim();
    const startTime = String(formData.get("start_time") ?? "").trim();
    const duration = String(formData.get("duration_minutes") ?? "").trim();
    const recurrence = String(formData.get("recurrence_type") ?? "").trim();
    const trialMode = String(formData.get("trial_mode") ?? "all_sessions").trim();
    const cancellationModel = String(formData.get("cancellation_model") ?? "").trim();
    const instructorName = String(formData.get("instructor_name") ?? "").trim();

    if (!title) {
      setError("Bitte gib einen Titel ein.");
      return;
    }
    if (!weekday) {
      setError("Bitte waehle einen Wochentag.");
      return;
    }
    if (!startDate) {
      setError("Bitte waehle ein Startdatum fuer den Kurs.");
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
    if (trialMode !== "all_sessions" && trialMode !== "manual") {
      setError("Bitte waehle eine gueltige Probestunden-Regel.");
      return;
    }
    if (!cancellationModel) {
      setError("Bitte waehle ein Kuendigungsmodell.");
      return;
    }
    if (providerType === "studio_provider" && !instructorName) {
      setError("Bitte gib den Dozenten fuer diesen Kurs an.");
      return;
    }

    const selectedWeekday = Number(weekday);
    const startDateWeekday = getWeekdayForDate(startDate);
    if (!Number.isInteger(selectedWeekday) || startDateWeekday === null) {
      setError("Bitte waehle ein gueltiges Startdatum fuer den Kurs.");
      return;
    }
    if (selectedWeekday !== startDateWeekday) {
      setError("Das Startdatum muss zum gewaehlten Wochentag passen.");
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
            placeholder="z. B. Toepfern Basics"
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
          placeholder="Kurzbeschreibung fuer den Kurs."
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
            <option value="weekly">Woechentlich</option>
            <option value="biweekly">14-taegig</option>
            <option value="monthly">Monatlich</option>
          </select>
          <span className="block text-xs text-muted-foreground">
            Das Startdatum ist der Anker fuer den Rhythmus und muss zum Wochentag passen.
          </span>
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium">Probestunden-Regel *</span>
          <select
            name="trial_mode"
            required
            defaultValue={initialValues?.trial_mode ?? "all_sessions"}
            className="w-full rounded-xl border px-3 py-2 text-sm"
          >
            <option value="all_sessions">
              Probeschueler*innen koennen an jedem Termin teilnehmen
            </option>
            <option value="manual">
              Probeschueler*innen koennen nur an ausgewaehlten Terminen teilnehmen
            </option>
          </select>
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-sm font-medium">Kuendigungsmodell *</span>
        <select
          name="cancellation_model"
          required
          defaultValue={initialValues?.cancellation_model ?? "monthly"}
          className="w-full rounded-xl border px-3 py-2 text-sm"
        >
          {cancellationOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span className="block text-xs text-muted-foreground">
          Kund*innen lieben Flexibilitaet. Kuerzere Kuendigungsfristen fuehren oft zu mehr
          Buchungen.
        </span>
        <span className="block text-xs text-muted-foreground">
          Monatlich endet einen Monat nach der Kuendigung, vierteljaehrlich nach drei Monaten
          und halbjaehrlich nach sechs Monaten.
        </span>
      </label>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="space-y-1 sm:col-span-1">
          <span className="text-sm font-medium">Kapazitaet</span>
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
            value={priceEur}
            onChange={(event) => setPriceEur(event.target.value)}
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
            <span>Kurspreis</span>
            <span>{formatCurrency(priceBreakdown.grossCents, currency)}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span>Plattformgebuehr ({STRIPE_PLATFORM_FEE_PERCENT} %)</span>
            <span>{formatCurrency(priceBreakdown.platformFeeCents, currency)}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span>Geschaetzte Stripe-Gebuehren</span>
            <span>{formatCurrency(priceBreakdown.stripeFeeEstimateCents, currency)}</span>
          </div>
          <div className="flex items-center justify-between gap-4 font-medium text-foreground">
            <span>Voraussichtliche Auszahlung pro Kund*in</span>
            <span>{formatCurrency(priceBreakdown.payoutCents, currency)}</span>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Stripe ist nur eine Schaetzung ({STRIPE_ESTIMATE_PERCENT.toFixed(1)} % +{" "}
          {formatCurrency(STRIPE_ESTIMATE_FIXED_FEE_CENTS, currency)} pro Zahlung) und kann je
          nach Zahlungsmethode abweichen.
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
