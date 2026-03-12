"use client";

import { useActionState, useMemo } from "react";
import { reserveTrialAction, type TrialReservationState } from "./actions";
import type { TrialSlot } from "./trial-slots";

const initialState: TrialReservationState = {};

export default function ReserveTrialButton({
  courseId,
  trialSlots,
}: {
  courseId: string;
  trialSlots: TrialSlot[];
}) {
  const action = useMemo(() => reserveTrialAction.bind(null, courseId), [courseId]);
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-3">
      {state.error ? <p className="text-sm text-red-700">{state.error}</p> : null}

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Verfügbare Probestunden-Termine *</legend>
        <div className="space-y-2">
          {trialSlots.map((slot) => (
            <label key={slot.startsAt} className="flex items-center gap-2 rounded-lg border px-3 py-2">
              <input type="radio" name="trial_starts_at" value={slot.startsAt} required />
              <span className="text-sm">{slot.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="space-y-1">
        <label htmlFor="first_name" className="block text-sm font-medium">
          Vorname
        </label>
        <input
          id="first_name"
          name="first_name"
          type="text"
          required
          className="w-full rounded-lg border px-3 py-2"
          autoComplete="given-name"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="last_name" className="block text-sm font-medium">
          Nachname
        </label>
        <input
          id="last_name"
          name="last_name"
          type="text"
          required
          className="w-full rounded-lg border px-3 py-2"
          autoComplete="family-name"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="email" className="block text-sm font-medium">
          E-Mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className="w-full rounded-lg border px-3 py-2"
          autoComplete="email"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-xl border border-black bg-black px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70"
      >
        {pending ? "Reserviere..." : "Kostenlose Probestunde reservieren"}
      </button>
    </form>
  );
}
