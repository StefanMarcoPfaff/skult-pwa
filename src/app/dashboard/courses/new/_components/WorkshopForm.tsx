"use client";

import { useMemo, useRef, useState, useTransition, type ReactNode } from "react";
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
  max_guest_count_per_booking?: string;
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
type WorkshopSection = "basic" | "location" | "schedule" | "booking" | "payment" | "publishing";
type WorkshopValidationIssue = {
  field: string;
  message: string;
  section: WorkshopSection;
};
type WorkshopFieldErrors = Record<string, string>;
type WorkshopActionResult = {
  error?: string;
  fieldErrors?: WorkshopFieldErrors;
  validationErrors?: WorkshopValidationIssue[];
  redirectTo?: string;
};

const sectionLabels: Record<WorkshopSection, string> = {
  basic: "Grunddaten",
  location: "Ort & Leitung",
  schedule: "Termine",
  booking: "Plaetze & Buchungsoptionen",
  payment: "Preis & Zahlung",
  publishing: "Veroeffentlichung",
};

function getWorkshopFieldSection(field: string): WorkshopSection {
  if (
    field === "title" ||
    field === "description" ||
    field === "offer_image_file" ||
    field === "visibility" ||
    field === "reservation_notice"
  ) {
    return "basic";
  }
  if (field === "location" || field === "location_details" || field === "instructor_name") return "location";
  if (field === "sessions") return "schedule";
  if (field === "capacity" || field === "max_guest_count_per_booking") return "booking";
  if (field === "price_eur" || field === "currency" || field === "workshop_storno_policy") return "payment";
  return "publishing";
}

function WorkshopFormSection(props: {
  section: WorkshopSection;
  open: boolean;
  hasError: boolean;
  onToggle: (section: WorkshopSection, open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <details
      open={props.open}
      onToggle={(event) => props.onToggle(props.section, event.currentTarget.open)}
      className={`rounded-2xl border p-4 ${props.hasError ? "border-red-300 bg-red-50/30" : "bg-white"}`}
    >
      <summary className="cursor-pointer text-base font-semibold">
        <span>{sectionLabels[props.section]}</span>
        {props.hasError ? <span className="ml-2 text-sm font-medium text-red-700">Bitte pruefen</span> : null}
      </summary>
      <div className="mt-4 space-y-4">{props.children}</div>
    </details>
  );
}

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
  submitActionOverride?: (formData: FormData) => Promise<WorkshopActionResult | void>;
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
  const [fieldErrors, setFieldErrors] = useState<WorkshopFieldErrors>({});
  const [openSections, setOpenSections] = useState<WorkshopSection[]>(["basic"]);
  const [offerImageError, setOfferImageError] = useState<string | null>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const [priceEur, setPriceEur] = useState(initialValues?.price_eur ?? "");
  const [capacityValue, setCapacityValue] = useState(initialValues?.capacity ?? "");
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

  function getFieldError(field: string): string | undefined {
    return fieldErrors[field];
  }

  function fieldInputClass(field: string, className = "w-full rounded-xl border px-3 py-2 text-sm") {
    return getFieldError(field)
      ? `${className} border-red-400 bg-red-50 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-100`
      : className;
  }

  function renderFieldError(field: string) {
    const message = getFieldError(field);
    return message ? <span className="block text-xs font-medium text-red-700">{message}</span> : null;
  }

  function getSectionsForErrors(errors: WorkshopFieldErrors): WorkshopSection[] {
    return Array.from(new Set(Object.keys(errors).map(getWorkshopFieldSection)));
  }

  function setFieldErrorsAndOpen(errors: WorkshopFieldErrors) {
    setFieldErrors(errors);
    const errorSections = getSectionsForErrors(errors);
    if (errorSections.length > 0) {
      setOpenSections((current) => Array.from(new Set([...current, ...errorSections])));
    }
  }

  function toggleSection(section: WorkshopSection, open: boolean) {
    setOpenSections((current) =>
      open ? Array.from(new Set([...current, section])) : current.filter((item) => item !== section)
    );
  }

  function sectionHasError(section: WorkshopSection): boolean {
    return Object.keys(fieldErrors).some((field) => getWorkshopFieldSection(field) === section);
  }

  const errorEntries = Object.entries(fieldErrors);

  const submitAction = (formData: FormData) => {
    const nextFieldErrors: WorkshopFieldErrors = {};
    const title = String(formData.get("title") ?? "").trim();
    const stornoPolicy = String(formData.get("workshop_storno_policy") ?? "").trim();
    const instructorName = String(formData.get("instructor_name") ?? "").trim();
    const location = String(formData.get("location") ?? "").trim();
    const visibility = String(formData.get("visibility") ?? "").trim();

    if (offerImageError) {
      nextFieldErrors.offer_image_file = offerImageError;
    }

    if (!title) {
      nextFieldErrors.title = "Bitte einen Titel eingeben.";
    }

    if (!location) {
      nextFieldErrors.location = "Bitte einen Ort eingeben.";
    }

    if (visibility !== "public" && visibility !== "private_link") {
      nextFieldErrors.visibility = "Bitte eine gültige Sichtbarkeit auswählen.";
    }

    if (providerType === "studio_provider" && !instructorName) {
      nextFieldErrors.instructor_name = "Bitte eine verantwortliche Person für dieses Angebot angeben.";
    }

    if (!stornoPolicy) {
      nextFieldErrors.workshop_storno_policy = "Bitte eine Storno-Regel auswählen.";
    }

    if (sessions.length === 0) {
      nextFieldErrors.sessions = "Bitte mindestens einen Termin angeben.";
    }

    const priceRaw = String(formData.get("price_eur") ?? "").trim();
    const capacityRaw = String(formData.get("capacity") ?? "").trim();
    const maxGuestsRaw = String(formData.get("max_guest_count_per_booking") ?? "0").trim();
    const parsedCapacity = capacityRaw ? Number(capacityRaw) : null;
    const parsedMaxGuests = maxGuestsRaw ? Number(maxGuestsRaw) : 0;
    const capacityIsValid =
      parsedCapacity !== null &&
      Number.isFinite(parsedCapacity) &&
      Number.isInteger(parsedCapacity) &&
      parsedCapacity >= 1;
    const maxGuestsIsValid =
      Number.isFinite(parsedMaxGuests) && Number.isInteger(parsedMaxGuests) && parsedMaxGuests >= 0;
    if (!capacityIsValid) {
      nextFieldErrors.capacity = "Bitte eine maximale Teilnehmeranzahl angeben.";
    }
    if (!maxGuestsIsValid) {
      nextFieldErrors.max_guest_count_per_booking =
        "Bitte eine gültige Anzahl weiterer teilnehmender Personen eingeben.";
    }
    if (capacityIsValid && maxGuestsIsValid && parsedMaxGuests > Math.max(0, Math.trunc(parsedCapacity) - 1)) {
      nextFieldErrors.max_guest_count_per_booking =
        "Weitere teilnehmende Personen pro Buchung dürfen höchstens Kapazität minus 1 sein.";
    }
    if (priceRaw) {
      const parsed = Number(priceRaw.replace(",", "."));
      if (!Number.isFinite(parsed) || parsed < 0) {
        nextFieldErrors.price_eur = "Bitte einen gültigen Preis eingeben.";
      }
    }

    for (const session of sessions) {
      if (!session.starts_at || !session.ends_at) {
        nextFieldErrors.sessions = "Bitte Start- und Endzeit für alle Termine ausfüllen.";
        break;
      }

      const start = new Date(session.starts_at);
      const end = new Date(session.ends_at);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        nextFieldErrors.sessions = "Ein Termin hat ein ungültiges Datum.";
        break;
      }
      if (end <= start) {
        nextFieldErrors.sessions = "Ende muss nach dem Start liegen.";
        break;
      }
    }

    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrorsAndOpen(nextFieldErrors);
      setError("Bitte korrigiere die markierten Angaben.");
      return;
    }

    setFieldErrors({});
    setError(null);
    startTransition(async () => {
      try {
        const action = submitActionOverride ?? createWorkshopAction;
        const result: WorkshopActionResult = await Promise.race([
          action(formData).then((value) => value ?? {}),
          new Promise<WorkshopActionResult>((resolve) =>
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
          setFieldErrorsAndOpen(result.fieldErrors ?? {});
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
    <form action={submitAction} className="space-y-4" noValidate>
      <input type="hidden" name="offer_kind" value={offerKind} readOnly />
      <input type="hidden" name="sessions_json" value={JSON.stringify(sessionsAsISO)} readOnly />
      <input type="hidden" name="price_cents" value={priceCentsOrEmpty} readOnly />

      <WorkshopFormSection section="basic" open={openSections.includes("basic")} hasError={sectionHasError("basic")} onToggle={toggleSection}>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-sm font-medium">Titel *</span>
          <input
            name="title"
            defaultValue={initialValues?.title ?? ""}
            aria-invalid={Boolean(getFieldError("title"))}
            className={fieldInputClass("title")}
            placeholder="z. B. Keramik-Weekend"
          />
          {renderFieldError("title")}
        </label>
      </div>

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

      <OfferImageField
        initialUrl={initialValues?.offer_image_url ?? ""}
        error={getFieldError("offer_image_file") ?? offerImageError}
        onValidationError={(nextError) => {
          setOfferImageError(nextError);
          setFieldErrors((prev) => {
            const next = { ...prev };
            if (nextError) next.offer_image_file = nextError;
            else delete next.offer_image_file;
            return next;
          });
        }}
      />

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
          aria-invalid={Boolean(getFieldError("visibility"))}
          className={fieldInputClass("visibility")}
        >
          <option value="public">Öffentlich sichtbar</option>
          <option value="private_link">Nur per Link buchbar</option>
        </select>
        {renderFieldError("visibility")}
        <div className="space-y-1 text-xs text-muted-foreground">
          <p>Öffentlich sichtbar: Dein Angebot erscheint auf RESER und kann von allen gefunden und gebucht werden.</p>
          <p>Nur per Link buchbar: Dein Angebot erscheint nicht öffentlich auf RESER. Du kannst den Link gezielt an ausgewählte Personen schicken.</p>
        </div>
      </label>
      </WorkshopFormSection>

      <WorkshopFormSection section="location" open={openSections.includes("location")} hasError={sectionHasError("location")} onToggle={toggleSection}>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-sm font-medium">Ort *</span>
            <input
              name="location"
              defaultValue={initialValues?.location ?? ""}
              aria-invalid={Boolean(getFieldError("location"))}
              className={fieldInputClass("location")}
              placeholder="z. B. Treffpunkt Innenstadt"
            />
            {renderFieldError("location")}
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium">Raum / Zusatzinfo zum Ort</span>
            <input
              name="location_details"
              defaultValue={initialValues?.location_details ?? ""}
              className="w-full rounded-xl border px-3 py-2 text-sm"
              placeholder="z. B. Raumname, Stockwerk, Klingelhinweis oder Treffpunkt"
            />
          </label>
        </div>

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
              defaultValue={initialValues?.instructor_name ?? ""}
              aria-invalid={Boolean(getFieldError("instructor_name"))}
              className={fieldInputClass("instructor_name")}
              placeholder="Name der Leitung"
            />
            {renderFieldError("instructor_name")}
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
      </WorkshopFormSection>

      <WorkshopFormSection section="schedule" open={openSections.includes("schedule")} hasError={sectionHasError("schedule")} onToggle={toggleSection}>
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
              <div
                key={session.id}
                className={`space-y-2 rounded-xl border p-3 ${
                  getFieldError("sessions") || sessionError ? "border-red-300 bg-red-50/40" : ""
                }`}
              >
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
                      aria-invalid={Boolean(getFieldError("sessions") || sessionError)}
                      className={
                        getFieldError("sessions") || sessionError
                          ? "w-full rounded-xl border border-red-400 bg-red-50 px-3 py-2 text-sm"
                          : "w-full rounded-xl border px-3 py-2 text-sm"
                      }
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
                      aria-invalid={Boolean(getFieldError("sessions") || sessionError)}
                      className={
                        getFieldError("sessions") || sessionError
                          ? "w-full rounded-xl border border-red-400 bg-red-50 px-3 py-2 text-sm"
                          : "w-full rounded-xl border px-3 py-2 text-sm"
                      }
                    />
                  </label>
                </div>

                {sessionError ? <p className="text-xs text-red-600">{sessionError}</p> : null}
              </div>
            );
          })}
          {renderFieldError("sessions")}
        </div>
      </div>
      </WorkshopFormSection>

      <WorkshopFormSection section="booking" open={openSections.includes("booking")} hasError={sectionHasError("booking")} onToggle={toggleSection}>
      <label className="space-y-1">
        <span className="text-sm font-medium">Max. Teilnehmende *</span>
        <input
          type="number"
          name="capacity"
          min={1}
          value={capacityValue}
          onChange={(event) => setCapacityValue(event.target.value)}
          aria-invalid={Boolean(getFieldError("capacity"))}
          className={fieldInputClass("capacity")}
          placeholder="10"
        />
        {renderFieldError("capacity")}
      </label>

      <label className="space-y-1">
        <span className="text-sm font-medium">Weitere teilnehmende Personen pro Buchung</span>
        <input
          type="number"
          name="max_guest_count_per_booking"
          min={0}
          max={capacityValue ? Math.max(0, Number(capacityValue) - 1) : undefined}
          defaultValue={initialValues?.max_guest_count_per_booking ?? "0"}
          aria-invalid={Boolean(getFieldError("max_guest_count_per_booking"))}
          className={fieldInputClass("max_guest_count_per_booking")}
          placeholder="0"
        />
        {renderFieldError("max_guest_count_per_booking")}
        <span className="block text-xs text-muted-foreground">
          0 bedeutet: nur die buchende Person. Maximal Kapazitaet minus 1.
        </span>
      </label>
      </WorkshopFormSection>

      <WorkshopFormSection section="payment" open={openSections.includes("payment")} hasError={sectionHasError("payment")} onToggle={toggleSection}>
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
            aria-invalid={Boolean(getFieldError("price_eur"))}
            className={fieldInputClass("price_eur")}
            placeholder="49.00"
          />
          {renderFieldError("price_eur")}
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

      <label className="block space-y-1">
        <span className="text-sm font-medium">Storno-Regel *</span>
        <select
          name="workshop_storno_policy"
          defaultValue={initialValues?.workshop_storno_policy ?? "no_refund"}
          aria-invalid={Boolean(getFieldError("workshop_storno_policy"))}
          className={fieldInputClass("workshop_storno_policy")}
        >
          {stornoOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {renderFieldError("workshop_storno_policy")}
        <span className="block text-xs text-muted-foreground">
          Klare und flexible Storno-Regeln schaffen Vertrauen und fuehren oft zu mehr Buchungen.
        </span>
      </label>

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

      </WorkshopFormSection>

      <WorkshopFormSection section="publishing" open={openSections.includes("publishing")} hasError={sectionHasError("publishing")} onToggle={toggleSection}>
      {errorEntries.length > 0 ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700">
          <p className="font-semibold">Bitte korrigiere folgende Angaben:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {errorEntries.map(([field, message]) => (
              <li key={field}>{message}</li>
            ))}
          </ul>
        </div>
      ) : null}

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
        disabled={pending}
        className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Speichert..." : submitLabel}
      </button>
      <p className="text-xs text-muted-foreground">
        Dein Angebot wird zunächst als Entwurf gespeichert. Im nächsten Schritt kannst du es prüfen und veröffentlichen.
      </p>
      </WorkshopFormSection>
    </form>
  );
}

