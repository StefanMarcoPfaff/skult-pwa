"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { calculateCoursePriceBreakdown } from "@/lib/course-pricing";
import { DEFAULT_PLATFORM_FEE_PERCENT } from "@/lib/platform-fees";
import type { ProviderType, WorkshopStornoPolicy } from "@/lib/provider-profiles";
import { getWorkshopCheckoutCurrency } from "@/lib/workshop-checkout";
import { createWorkshopAction } from "../actions";
import OfferImageField from "./OfferImageField";

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
  visibility?: "public" | "private_link";
  internal_note?: string;
  reservation_notice?: string;
  offer_image_url?: string;
};

type SinglePaymentOfferKind = "workshop" | "exclusive_offer";

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

export default function WorkshopForm({
  initialValues,
  submitActionOverride,
  submitLabel = "Entwurf speichern",
  providerType,
  providerDisplayName,
  platformFeePercent = DEFAULT_PLATFORM_FEE_PERCENT,
  offerKind = "workshop",
}: {
  initialValues?: WorkshopFormValues;
  submitActionOverride?: (formData: FormData) => Promise<{ error?: string; redirectTo?: string } | void>;
  submitLabel?: string;
  providerType: ProviderType;
  providerDisplayName: string;
  platformFeePercent?: number;
  offerKind?: SinglePaymentOfferKind;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const workshopCurrency = getWorkshopCheckoutCurrency();
  const isLegacyExclusiveOffer = offerKind === "exclusive_offer";
  const [error, setError] = useState<string | null>(null);
  const [offerImageError, setOfferImageError] = useState<string | null>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const [priceEur, setPriceEur] = useState(initialValues?.price_eur ?? "");
  const [currency] = useState(workshopCurrency);
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

  const platformFeePercentLabel = platformFeePercent * 100;
  const priceBreakdown = calculateCoursePriceBreakdown(
    priceCentsOrEmpty ? Number(priceCentsOrEmpty) : 0,
    providerType,
    platformFeePercent
  );

  const submitAction = (formData: FormData) => {
    const title = String(formData.get("title") ?? "").trim();
    const stornoPolicy = String(formData.get("workshop_storno_policy") ?? "").trim();
    const instructorName = String(formData.get("instructor_name") ?? "").trim();

    if (offerImageError) {
      setError(offerImageError);
      return;
    }

    if (!title) {
      setError("Bitte gib einen Titel ein.");
      return;
    }

    if (providerType === "studio_provider" && !instructorName) {
      setError("Bitte gib die Leitung fuer dieses einmalige Angebot an.");
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
    startTransition(async () => {
      try {
        const action = submitActionOverride ?? createWorkshopAction;
        const result: { error?: string; redirectTo?: string } = await Promise.race([
          action(formData).then((value) => value ?? {}),
          new Promise<{ error?: string; redirectTo?: string }>((resolve) =>
            setTimeout(
              () =>
                resolve({
                  error: "Das Speichern des einmaligen Angebots dauert zu lange. Bitte versuche es erneut.",
                }),
              25000
            )
          ),
        ]);

        if (result?.error) {
          setError(result.error);
          return;
        }

        if (result?.redirectTo) {
          router.push(result.redirectTo);
          router.refresh();
        }
      } catch (submitError) {
        console.error("[workshop-form] submit failed", {
          message: submitError instanceof Error ? submitError.message : String(submitError),
        });
        setError("Beim Speichern des einmaligen Angebots ist ein Fehler aufgetreten. Bitte versuche es erneut.");
      }
    });
  };

  function insertDescriptionMarkup(before: string, after = before) {
    const textarea = descriptionRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = textarea.value.slice(start, end);
    const nextValue = `${textarea.value.slice(0, start)}${before}${selected}${after}${textarea.value.slice(end)}`;
    textarea.value = nextValue;
    const nextCursor = selected ? start + before.length + selected.length + after.length : start + before.length;
    textarea.focus();
    textarea.setSelectionRange(nextCursor, nextCursor);
  }

  return (
    <form action={submitAction} className="space-y-4">
      <input type="hidden" name="offer_kind" value={offerKind} readOnly />
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
            placeholder="z. B. Treffpunkt Innenstadt"
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
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => insertDescriptionMarkup("**")}
            className="rounded-lg border px-2 py-1 text-xs font-bold"
            title="Fett"
          >
            B
          </button>
          <button
            type="button"
            onClick={() => insertDescriptionMarkup("*")}
            className="rounded-lg border px-2 py-1 text-xs italic"
            title="Kursiv"
          >
            I
          </button>
          <button
            type="button"
            onClick={() => insertDescriptionMarkup("<u>", "</u>")}
            className="rounded-lg border px-2 py-1 text-xs underline"
            title="Unterstrichen"
          >
            U
          </button>
          <button
            type="button"
            onClick={() => insertDescriptionMarkup("\n\n", "")}
            className="rounded-lg border px-2 py-1 text-xs font-semibold"
            title="Absatz"
          >
            ¶
          </button>
        </div>
        <textarea
          ref={descriptionRef}
          name="description"
          rows={4}
          defaultValue={initialValues?.description ?? ""}
          className="w-full rounded-xl border px-3 py-2 text-sm"
          placeholder="Kurzbeschreibung fuer die Angebotsseite. Absätze bleiben erhalten."
        />
        <span className="block text-xs text-muted-foreground">
          Unterstützt **fett**, *kursiv*, &lt;u&gt;unterstrichen&lt;/u&gt; und Leerzeilen als Absätze.
        </span>
      </label>

      <OfferImageField initialUrl={initialValues?.offer_image_url ?? ""} onValidationError={setOfferImageError} />

      <label className="block space-y-1">
        <span className="text-sm font-medium">Interne Notiz</span>
        <textarea
          name="internal_note"
          rows={3}
          defaultValue={initialValues?.internal_note ?? ""}
          className="w-full rounded-xl border px-3 py-2 text-sm"
          placeholder="Nur intern sichtbar, z. B. Anlass, Konditionen oder Teilnehmenden-Kontext."
        />
        <span className="block text-xs text-muted-foreground">
          Nur fuer dich sichtbar. Teilnehmende sehen diese Notiz nicht.
        </span>
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium">Reservierungshinweis (optional)</span>
        <textarea
          name="reservation_notice"
          rows={3}
          defaultValue={initialValues?.reservation_notice ?? ""}
          className="w-full rounded-xl border px-3 py-2 text-sm"
          placeholder="Hinweis fuer Teilnehmende vor der Reservierung."
        />
        <span className="block text-xs text-muted-foreground">
          Dieser Hinweis wird direkt über dem Reservierungsformular angezeigt.
        </span>
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium">Sichtbarkeit *</span>
        <select
          name="visibility"
          defaultValue={initialValues?.visibility ?? (isLegacyExclusiveOffer ? "private_link" : "public")}
          className="w-full rounded-xl border px-3 py-2 text-sm"
        >
          <option value="public">Öffentlich sichtbar</option>
          <option value="private_link">Nur per Link buchbar</option>
        </select>
        <div className="space-y-1 text-xs text-muted-foreground">
          <p>Öffentlich sichtbar: Dein Angebot erscheint auf RESER und kann von allen gefunden und gebucht werden.</p>
          <p>Nur per Link buchbar: Dein Angebot erscheint nicht öffentlich auf RESER. Du kannst den Link gezielt an ausgewählte Personen schicken.</p>
        </div>
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
            <span className="text-sm font-medium">Leitung: *</span>
            <input
              name="instructor_name"
              required
              defaultValue={initialValues?.instructor_name ?? ""}
              className="w-full rounded-xl border px-3 py-2 text-sm"
              placeholder="Name der Leitung"
            />
          </label>
        </div>
      ) : (
        <label className="block space-y-1">
          <span className="text-sm font-medium">Leitung:</span>
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
          {!isLegacyExclusiveOffer ? (
            <button
              type="button"
              onClick={() => setSessions((prev) => [...prev, createEmptySession()])}
              className="rounded-lg border px-3 py-1 text-xs font-semibold"
            >
              Termin hinzufuegen
            </button>
          ) : null}
        </div>

        <div className="space-y-3">
          {sessions.map((session, index) => {
            const sessionError = sessionErrors[index];
            return (
              <div key={session.id} className="space-y-2 rounded-xl border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-muted-foreground">Termin {index + 1}</p>
                  {!isLegacyExclusiveOffer ? (
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
                  ) : null}
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
        <span className="text-sm font-medium">Max. Teilnehmende</span>
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
          <span className="text-sm font-medium">Preis pro Person (EUR)</span>
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
          <span className="block text-xs text-muted-foreground">
            0,00 ist erlaubt. Kostenlose einmalige Angebote werden ohne Stripe direkt bestätigt.
          </span>
        </label>

        <label className="space-y-1">
          <span className="text-sm font-medium">Waehrung</span>
          <input
            name="currency"
            value={currency}
            readOnly
            className="w-full rounded-xl border bg-gray-50 px-3 py-2 text-sm uppercase text-gray-700"
          />
        </label>
      </div>

      <div className="rounded-2xl border bg-gray-50 p-4 text-sm">
        <p className="font-medium">Preisaufteilung</p>
        <div className="mt-3 space-y-1 text-muted-foreground">
          <div className="flex items-center justify-between gap-4">
            <span>Preis pro Person</span>
            <span>{formatCurrency(priceBreakdown.grossCents, currency)}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span>Plattformgebuehr ({platformFeePercentLabel} %)</span>
            <span>{formatCurrency(priceBreakdown.platformFeeCents, currency)}</span>
          </div>
          <div className="flex items-center justify-between gap-4 font-medium text-foreground">
            <span>Deine Einnahmen pro Teilnehmende</span>
            <span>{formatCurrency(priceBreakdown.payoutCents, currency)}</span>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Die Auszahlung an Dich berechnet sich aus dem eingegebenen Preis abzueglich der
          Plattformgebuehr von {platformFeePercentLabel} %.
        </p>
      </div>

      <p className="text-xs text-muted-foreground">
        Kostenpflichtige Einmalangebote nutzen aktuell Checkout in {workshopCurrency}. Kostenlose
        Einmalangebote werden direkt bestätigt.
      </p>

      {offerImageError ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {offerImageError}
        </p>
      ) : null}

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending || Boolean(offerImageError)}
        className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Speichert..." : submitLabel}
      </button>
      <p className="text-xs text-muted-foreground">
        Dein Angebot wird zunächst als Entwurf gespeichert. Im nächsten Schritt kannst du es prüfen und veröffentlichen.
      </p>
    </form>
  );
}
