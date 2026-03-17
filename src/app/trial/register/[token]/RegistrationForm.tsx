"use client";

import { useActionState } from "react";
import { submitTrialRegistrationAction } from "./actions";

type CourseInfo = {
  title: string;
  providerName: string | null;
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
};

export default function RegistrationForm({
  token,
  course,
  prefill,
  initialError,
}: {
  token: string;
  course: CourseInfo;
  prefill: Prefill;
  initialError?: string | null;
}) {
  const [state, formAction, pending] = useActionState(submitTrialRegistrationAction, {});

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="token" value={token} />

      <section className="rounded-2xl border p-6">
        <h1 className="text-2xl font-semibold">Verbindliche Kursanmeldung</h1>
        <div className="mt-4 space-y-2 text-sm text-muted-foreground">
          <p>Kurs: <span className="font-medium text-foreground">{course.title}</span></p>
          {course.providerName ? <p>Anbieter: <span className="font-medium text-foreground">{course.providerName}</span></p> : null}
          {course.instructorName ? <p>Dozent: <span className="font-medium text-foreground">{course.instructorName}</span></p> : null}
          {course.priceLabel ? <p>Preis: <span className="font-medium text-foreground">{course.priceLabel}</span></p> : null}
          {course.cancellationLabel ? (
            <p>Kurs- und Kuendigungsregelung: <span className="font-medium text-foreground">{course.cancellationLabel}</span></p>
          ) : null}
          {course.location ? <p>Ort: <span className="font-medium text-foreground">{course.location}</span></p> : null}
          {course.locationDetails ? (
            <p>Raum / Zusatzinfo: <span className="font-medium text-foreground">{course.locationDetails}</span></p>
          ) : null}
        </div>
      </section>

      <section className="rounded-2xl border p-6 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-sm font-medium">Vorname *</span>
            <input name="first_name" required defaultValue={prefill.first_name} className="w-full rounded-xl border px-3 py-2 text-sm" />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium">Nachname *</span>
            <input name="last_name" required defaultValue={prefill.last_name} className="w-full rounded-xl border px-3 py-2 text-sm" />
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-sm font-medium">E-Mail *</span>
            <input type="email" name="email" required defaultValue={prefill.email} className="w-full rounded-xl border px-3 py-2 text-sm" />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium">Telefon *</span>
            <input name="phone" required className="w-full rounded-xl border px-3 py-2 text-sm" />
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 sm:col-span-2">
            <span className="text-sm font-medium">Strasse und Hausnummer *</span>
            <input name="street_and_number" required className="w-full rounded-xl border px-3 py-2 text-sm" />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium">PLZ *</span>
            <input name="postal_code" required className="w-full rounded-xl border px-3 py-2 text-sm" />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium">Ort *</span>
            <input name="city" required className="w-full rounded-xl border px-3 py-2 text-sm" />
          </label>
        </div>

        <label className="space-y-1 block">
          <span className="text-sm font-medium">Land *</span>
          <input name="country" required defaultValue="Deutschland" className="w-full rounded-xl border px-3 py-2 text-sm" />
        </label>

        <label className="space-y-1 block">
          <span className="text-sm font-medium">Notizen</span>
          <textarea name="notes" rows={4} className="w-full rounded-xl border px-3 py-2 text-sm" />
        </label>
      </section>

      <section className="rounded-2xl border p-6 space-y-3 text-sm">
        <label className="flex items-start gap-3">
          <input type="checkbox" name="binding_registration_confirmed" required className="mt-1" />
          <span>Ich melde mich hiermit verbindlich fuer den Kurs an.</span>
        </label>
        <label className="flex items-start gap-3">
          <input type="checkbox" name="agb_accepted" required className="mt-1" />
          <span>Ich akzeptiere die AGB.</span>
        </label>
        <label className="flex items-start gap-3">
          <input type="checkbox" name="privacy_accepted" required className="mt-1" />
          <span>Ich habe die Datenschutzerklaerung zur Kenntnis genommen.</span>
        </label>
        <label className="flex items-start gap-3">
          <input type="checkbox" name="cancellation_terms_accepted" required className="mt-1" />
          <span>Ich akzeptiere die Kurs- und Kuendigungsregelung dieses Angebots.</span>
        </label>
      </section>

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

      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Weiterleitung..." : "Verbindlich anmelden und zur Zahlung"}
      </button>
    </form>
  );
}
