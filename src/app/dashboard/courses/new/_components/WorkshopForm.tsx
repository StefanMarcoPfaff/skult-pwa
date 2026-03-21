"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { calculateCoursePriceBreakdown } from "@/lib/course-pricing";
import type { ProviderType, WorkshopStornoPolicy } from "@/lib/provider-profiles";
import { STRIPE_PLATFORM_FEE_PERCENT } from "@/lib/stripe-connect";
import { createWorkshopAction } from "../actions";

type SessionInput = {
  id: string;
  starts_at: string;
  ends_at: string;
};

const stornoOptions: Array<{ value: WorkshopStornoPolicy; label: string }> = [
  { value: "no_refund", label: "Keine Stornierung / keine Erstattung" },
  { value: "free_until_14_days_then_100", label: "Bis 14 Tage vorher kostenfrei, danach 100 %" },
  { value: "free_until_7_days_then_100", label: "Bis 7 Tage vorher kostenfrei, danach 100 %" },
  { value: "fifty_until_14_days_then_100", label: "Bis 14 Tage vorher 50 %, danach 100 %" },
];

export type WorkshopFormValues = {
  title?: string;
  location?: string;
  location_details?: string;
  description?: string;
  capacity?: string;
  price_eur?: string;
  currency?: string;
  instructor_name?: string;
  workshop_storno_policy?: WorkshopStornoPolicy;
  sessions?: Array<{ starts_at: string; ends_at: string }>;
};

function createEmptySession(): SessionInput {
  return {
    id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    starts_at: "",
    ends_at: "",
  };
}

function toDatetimeLocalValue(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function formatCurrency(cents: number, currency: string): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: currency || "EUR",
  }).format(cents / 100);
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
    >
      {pending ? "Speichert..." : label}
    </button>
  );
}

export default function WorkshopForm({
  initialValues,
  submitActionOverride,
  submitLabel = "Workshop erstellen",
  providerType,
  providerDisplayName,
}: {
  initialValues?: WorkshopFormValues;
  submitActionOverride?: (formData: FormData) => Promise<{ error?: string } | void>;
  submitLabel?: string;
  providerType: ProviderType;
  providerDisplayName: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [priceEur, setPriceEur] = useState(initialValues?.price_eur ?? "");
  const [currency, setCurrency] = useState(initialValues?.currency ?? "EUR");
  const [sessions, setSessions] = useState<SessionInput[]>(() =>
    initialValues?.sessions && initialValues.sessions.length > 0
      ? initialValues.sessions.map((session, index) => ({
          id: `session-${index + 1}`,
          starts_at: toDatetimeLocalValue(session.starts_at),
          ends_at: toDatetimeLocalValue(session.ends_at),
        }))
      : [createEmptySession()]
  );

  const sessionErrors = useMemo(() => {
    return sessions.map((session) => {
      if (!session.starts_at || !session.ends_at) return null;
      const start = new Date(session.starts_at);
      const end = new Date(session.ends_at);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return "Ungueltiges Datum";
      }
      if (end <= start) return "Ende muss nach dem Start liegen";
      return null;
    });
  }, [sessions]);

  const sessionsAsISO = useMemo(() => {
    return sessions.map((session) => {
      const start = session.starts_at ? new Date(session.starts_at) : null;
      const end = session.ends_at ? new Date(session.ends_at) : null;

      return {
        starts_at: start && !Number.isNaN(start.getTime()) ? start.toISOString() : "",
        ends_at: end && !Number.isNaN(end.getTime()) ? end.toISOString() : "",
      };
    });
  }, [sessions]);

  const priceCentsOrEmpty = useMemo(() => {
    const raw = priceEur.trim();
    if (!raw) return "";
    const parsed = Number(raw.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0) return "";
    return String(Math.round(parsed * 100));
  }, [priceEur]);

  const priceBreakdown = calculateCoursePriceBreakdown(priceCentsOrEmpty ? Number(priceCentsOrEmpty) : 0);

  const submitAction = async (formData: FormData) => {
    const title = String(formData.get("title") ?? "").trim();
    const stornoPolicy = String(formData.get("workshop_storno_policy") ?? "").trim();
    const instructorName = String(formData.get("instructor_name") ?? "").trim();

    if (!title) {
      setError("Bitte gib einen Titel ein.");
      return;
    }

    if (providerType === "studio_provider" && !instructorName) {
      setError("Bitte gib den Dozenten fuer diesen Workshop an.");
      return;
    }

    if (!stornoPolicy) {
      setError("Bitte waehle eine Storno-Regel.");
      return;
    }

    if (sessions.length === 0) {
      setError("Bitte fuege mindestens einen Termin hinzu.");
      return;
    }

    const priceRaw = String(formData.get("price_eur") ?? "").trim();
    if (priceRaw) {
      const parsed = Number(priceRaw.replace(",", "."));
      if (!Number.isFinite(parsed) || parsed < 0) {
        setError("Bitte gib einen gueltigen Preis >= 0 ein.");
        return;
      }
    }

    for (const session of sessions) {
      if (!session.starts_at || !session.ends_at) {
        setError("Bitte fuelle Start- und Endzeit fuer alle Termine aus.");
        return;
      }

      const start = new Date(session.starts_at);
      const end = new Date(session.ends_at);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        setError("Ein Termin hat ein ungueltiges Datum.");
        return;
      }
      if (end <= start) {
        setError("Ende muss nach dem Start liegen.");
        return;
      }
    }

    setError(null);
    const action = submitActionOverride ?? createWorkshopAction;
    const result = await action(formData);
    if (result?.error) {
      setError(result.error);
    }
  };

  return (
    <form action={submitAction} className="space-y-4">
      <input type="hidden" name="sessions_json" value={JSON.stringify(sessionsAsISO)} readOnly />
      <input type="hidden" name="price_cents" value={priceCentsOrEmpty} readOnly />

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-sm font-medium">Titel *</span>
          <input
            name="title"
            required
            defaultValue={initialValues?.title ?? ""}
            className="w-full rounded-xl border px-3 py-2 text-sm"
            placeholder="z. B. Keramik-Weekend"
          />
        </label>

        <label className="space-y-1">
          <span className="text-sm font-medium">Ort</span>
          <input
            name="location"
            defaultValue={initialValues?.location ?? ""}
            className="w-full rounded-xl border px-3 py-2 text-sm"
            placeholder="z. B. Studio Mitte"
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
          placeholder="Kurzbeschreibung fuer die Angebotsseite."
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
              placeholder="Name der Workshopleitung"
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

      <label className="block space-y-1">
        <span className="text-sm font-medium">Storno-Regel *</span>
        <select
          name="workshop_storno_policy"
          required
          defaultValue={initialValues?.workshop_storno_policy ?? "no_refund"}
          className="w-full rounded-xl border px-3 py-2 text-sm"
        >
          {stornoOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span className="block text-xs text-muted-foreground">
          Klare und flexible Storno-Regeln schaffen Vertrauen und fuehren oft zu mehr Buchungen.
        </span>
      </label>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <span className="text-sm font-medium">Termine *</span>
            <p className="text-xs text-muted-foreground">Jeder Termin benoetigt Start- und Endzeit.</p>
          </div>
          <button
            type="button"
            onClick={() => setSessions((prev) => [...prev, createEmptySession()])}
            className="rounded-lg border px-3 py-1 text-xs font-semibold"
          >
            Termin hinzufuegen
          </button>
        </div>

        <div className="space-y-3">
          {sessions.map((session, index) => {
            const sessionError = sessionErrors[index];
            return (
              <div key={session.id} className="space-y-2 rounded-xl border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-muted-foreground">Termin {index + 1}</p>
                  <button
                    type="button"
                    onClick={() =>
                      setSessions((prev) => prev.filter((item) => item.id !== session.id))
                    }
                    disabled={sessions.length === 1}
                    className="text-xs font-semibold text-red-600 disabled:opacity-40"
                  >
                    Entfernen
                  </button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1">
                    <span className="text-sm font-medium">Start *</span>
                    <input
                      type="datetime-local"
                      value={session.starts_at}
                      onChange={(event) =>
                        setSessions((prev) =>
                          prev.map((item) =>
                            item.id === session.id ? { ...item, starts_at: event.target.value } : item
                          )
                        )
                      }
                      className="w-full rounded-xl border px-3 py-2 text-sm"
                      required
                    />
                  </label>

                  <label className="space-y-1">
                    <span className="text-sm font-medium">Ende *</span>
                    <input
                      type="datetime-local"
                      value={session.ends_at}
                      onChange={(event) =>
                        setSessions((prev) =>
                          prev.map((item) =>
                            item.id === session.id ? { ...item, ends_at: event.target.value } : item
                          )
                        )
                      }
                      className="w-full rounded-xl border px-3 py-2 text-sm"
                      required
                    />
                  </label>
                </div>

                {sessionError ? <p className="text-xs text-red-600">{sessionError}</p> : null}
              </div>
            );
          })}
        </div>
      </div>

      <label className="space-y-1">
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

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1">
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
            placeholder="49.00"
          />
        </label>

        <label className="space-y-1">
          <span className="text-sm font-medium">Waehrung</span>
          <input
            name="currency"
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
            <span>Workshoppreis</span>
            <span>{formatCurrency(priceBreakdown.grossCents, currency)}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span>Plattformgebuehr ({STRIPE_PLATFORM_FEE_PERCENT} %)</span>
            <span>{formatCurrency(priceBreakdown.platformFeeCents, currency)}</span>
          </div>
          <div className="flex items-center justify-between gap-4 font-medium text-foreground">
            <span>Voraussichtliche Auszahlung pro Kund*in</span>
            <span>{formatCurrency(priceBreakdown.payoutCents, currency)}</span>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Die voraussichtliche Auszahlung berechnet sich aus dem eingegebenen Preis abzueglich
          der Plattformgebuehr von {STRIPE_PLATFORM_FEE_PERCENT} %.
        </p>
      </div>

      <p className="text-xs text-muted-foreground">Wird intern in Cent gespeichert.</p>

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <SubmitButton label={submitLabel} />
    </form>
  );
}
