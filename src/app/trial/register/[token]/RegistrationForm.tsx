"use client";

import Link from "next/link";
import QRCode from "react-qr-code";
import { useActionState } from "react";
import { buildTicketCheckInUrl } from "@/lib/ticket-qr";
import { submitTrialRegistrationAction } from "./actions";

type CourseInfo = {
  title: string;
  providerName: string | null;
  providerType?: "independent_teacher" | "studio_provider" | null;
  instructorName: string | null;
  priceLabel: string | null;
  cancellationLabel: string | null;
  location: string | null;
  locationDetails: string | null;
};

type Prefill = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  street_and_number: string;
  postal_code: string;
  city: string;
  country: string;
  notes: string;
};

export default function RegistrationForm({
  token,
  course,
  prefill,
  initialError,
  completedRegistration,
  editMode,
  ticketQrToken,
}: {
  token: string;
  course: CourseInfo;
  prefill: Prefill;
  initialError?: string | null;
  completedRegistration?: boolean;
  editMode?: boolean;
  ticketQrToken?: string | null;
}) {
  const [state, formAction, pending] = useActionState(submitTrialRegistrationAction, {});
  const isReadOnly = Boolean(completedRegistration && !editMode);
  const ticketCheckInUrl = ticketQrToken ? buildTicketCheckInUrl(ticketQrToken) : null;

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="token" value={token} />

      <section className="rounded-2xl border p-6">
        <h1 className="text-2xl font-semibold">
          {completedRegistration ? "Deine Anmeldedaten" : "Verbindliche Kursanmeldung"}
        </h1>
        {completedRegistration ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Hier siehst du die von dir übermittelten Anmeldedaten für diesen Kurs. Alle weiteren Informationen erhältst du per E-Mail.
          </p>
        ) : null}
        <div className="mt-4 space-y-2 text-sm text-muted-foreground">
          <p>Kurs: <span className="font-medium text-foreground">{course.title}</span></p>
          {course.providerType === "studio_provider" && course.providerName ? <p>Anbieter: <span className="font-medium text-foreground">{course.providerName}</span></p> : null}
          {course.instructorName ? <p>Dozent: <span className="font-medium text-foreground">{course.instructorName}</span></p> : null}
          {course.priceLabel ? <p>Preis: <span className="font-medium text-foreground">{course.priceLabel}</span></p> : null}
          {course.cancellationLabel ? (
            <p>Kurs- und Kündigungsregelung: <span className="font-medium text-foreground">{course.cancellationLabel}</span></p>
          ) : null}
          {course.location ? <p>Ort: <span className="font-medium text-foreground">{course.location}</span></p> : null}
          {course.locationDetails ? (
            <p>Raum / Zusatzinfo: <span className="font-medium text-foreground">{course.locationDetails}</span></p>
          ) : null}
        </div>
      </section>

      {completedRegistration ? (
        <section className="rounded-2xl border p-6">
          <h2 className="text-xl font-semibold">Dein Kursticket</h2>
          {ticketCheckInUrl ? (
            <>
              <p className="mt-2 text-sm text-muted-foreground">
                Dieses Ticket wird künftig für Anwesenheit und Check-in im Kurs verwendet.
              </p>
              <div className="mt-4 inline-block rounded-2xl border bg-white p-4">
                <QRCode value={ticketCheckInUrl} size={220} />
              </div>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              Dein Kursticket wird gerade vorbereitet. Bitte rufe diese Seite gleich noch einmal auf.
            </p>
          )}
        </section>
      ) : null}

      <section className="rounded-2xl border p-6 space-y-4">
        {completedRegistration ? (
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Übermittelte Daten</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {isReadOnly
                  ? "Die Angaben sind aktuell schreibgeschützt."
                  : "Bearbeitungsmodus aktiv. Du kannst die Daten jetzt anpassen."}
              </p>
            </div>
            {isReadOnly ? (
              <Link
                href={`/trial/register/${token}?edit=1`}
                className="inline-flex rounded-xl border px-4 py-2 text-sm font-semibold"
              >
                Anmeldedaten bearbeiten
              </Link>
            ) : null}
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-sm font-medium">Vorname *</span>
            <input
              name="first_name"
              required
              defaultValue={prefill.first_name}
              readOnly={isReadOnly}
              className="w-full rounded-xl border px-3 py-2 text-sm"
            />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium">Nachname *</span>
            <input
              name="last_name"
              required
              defaultValue={prefill.last_name}
              readOnly={isReadOnly}
              className="w-full rounded-xl border px-3 py-2 text-sm"
            />
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-sm font-medium">E-Mail *</span>
            <input
              type="email"
              name="email"
              required
              defaultValue={prefill.email}
              readOnly={isReadOnly}
              className="w-full rounded-xl border px-3 py-2 text-sm"
            />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium">Telefon *</span>
            <input
              name="phone"
              required
              defaultValue={prefill.phone}
              readOnly={isReadOnly}
              className="w-full rounded-xl border px-3 py-2 text-sm"
            />
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 sm:col-span-2">
            <span className="text-sm font-medium">Straße und Hausnummer *</span>
            <input
              name="street_and_number"
              required
              defaultValue={prefill.street_and_number}
              readOnly={isReadOnly}
              className="w-full rounded-xl border px-3 py-2 text-sm"
            />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium">PLZ *</span>
            <input
              name="postal_code"
              required
              defaultValue={prefill.postal_code}
              readOnly={isReadOnly}
              className="w-full rounded-xl border px-3 py-2 text-sm"
            />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium">Ort *</span>
            <input
              name="city"
              required
              defaultValue={prefill.city}
              readOnly={isReadOnly}
              className="w-full rounded-xl border px-3 py-2 text-sm"
            />
          </label>
        </div>

        <label className="space-y-1 block">
          <span className="text-sm font-medium">Land *</span>
          <input
            name="country"
            required
            defaultValue={prefill.country}
            readOnly={isReadOnly}
            className="w-full rounded-xl border px-3 py-2 text-sm"
          />
        </label>

        <label className="space-y-1 block">
          <span className="text-sm font-medium">Notizen</span>
          <textarea
            name="notes"
            rows={4}
            defaultValue={prefill.notes}
            readOnly={isReadOnly}
            className="w-full rounded-xl border px-3 py-2 text-sm"
          />
        </label>
      </section>

      {!completedRegistration ? (
        <section className="rounded-2xl border p-6 space-y-3 text-sm">
          <label className="flex items-start gap-3">
            <input type="checkbox" name="binding_registration_confirmed" required className="mt-1" />
            <span>Ich melde mich hiermit verbindlich für den Kurs an.</span>
          </label>
          <label className="flex items-start gap-3">
            <input type="checkbox" name="agb_accepted" required className="mt-1" />
            <span>Ich akzeptiere die AGB.</span>
          </label>
          <label className="flex items-start gap-3">
            <input type="checkbox" name="privacy_accepted" required className="mt-1" />
            <span>Ich habe die Datenschutzerklärung zur Kenntnis genommen.</span>
          </label>
          <label className="flex items-start gap-3">
            <input type="checkbox" name="cancellation_terms_accepted" required className="mt-1" />
            <span>Ich akzeptiere die Kurs- und Kündigungsregelung dieses Angebots.</span>
          </label>
        </section>
      ) : null}

      {initialError ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {initialError}
        </p>
      ) : null}

      {state.error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}

      {state.saved && !state.error && completedRegistration && editMode && !pending ? (
        <p className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          Deine Anmeldedaten wurden gespeichert.
        </p>
      ) : null}

      {!isReadOnly ? (
        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {completedRegistration
              ? pending
                ? "Speichern..."
                : "Anmeldedaten speichern"
              : pending
                ? "Weiterleitung..."
                : "Verbindlich anmelden und zur Zahlung"}
          </button>

          {completedRegistration ? (
            <Link
              href={`/trial/register/${token}`}
              className="inline-flex rounded-xl border px-4 py-2 text-sm font-semibold"
            >
              Zurück zur Ansicht
            </Link>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
