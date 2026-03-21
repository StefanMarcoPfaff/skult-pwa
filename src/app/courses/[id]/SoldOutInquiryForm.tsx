"use client";

import { useActionState, useMemo } from "react";
import { submitOfferInquiryAction, type OfferInquiryState } from "./inquiry-actions";

const initialState: OfferInquiryState = {};

export default function SoldOutInquiryForm({
  courseId,
  offerLabel,
}: {
  courseId: string;
  offerLabel: string;
}) {
  const action = useMemo(() => submitOfferInquiryAction.bind(null, courseId), [courseId]);
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Dieses {offerLabel} ist aktuell ausgebucht. Du kannst hier eine kurze Anfrage senden.
      </p>

      {state.error ? <p className="text-sm text-red-700">{state.error}</p> : null}
      {state.success ? (
        <p className="text-sm text-green-700">
          Deine Anfrage wurde versendet. Der Anbieter meldet sich bei dir.
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-sm font-medium">Vorname *</span>
          <input name="first_name" required className="w-full rounded-lg border px-3 py-2 text-sm" />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium">Nachname *</span>
          <input name="last_name" required className="w-full rounded-lg border px-3 py-2 text-sm" />
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-sm font-medium">E-Mail *</span>
        <input
          name="email"
          type="email"
          required
          className="w-full rounded-lg border px-3 py-2 text-sm"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium">Nachricht</span>
        <textarea name="message" rows={4} className="w-full rounded-lg border px-3 py-2 text-sm" />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="rounded-xl border border-black bg-black px-4 py-3 font-semibold text-white disabled:opacity-70"
      >
        {pending ? "Sende Anfrage..." : "Anfragen"}
      </button>
    </form>
  );
}
