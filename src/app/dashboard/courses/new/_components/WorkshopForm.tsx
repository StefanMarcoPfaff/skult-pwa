"use client";

import { useMemo, useState, useTransition } from "react";
import { createWorkshopAction } from "../actions";

type SessionInput = {
  id: string;
  starts_at: string;
  ends_at: string;
};

function createEmptySession(): SessionInput {
  return {
    id: Math.random().toString(36).slice(2, 10),
    starts_at: "",
    ends_at: "",
  };
}

export default function WorkshopForm() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionInput[]>([createEmptySession()]);

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

  const submitAction = (formData: FormData) => {
    const title = String(formData.get("title") ?? "").trim();

    if (!title) {
      setError("Bitte gib einen Titel ein.");
      return;
    }
    if (sessions.length === 0) {
      setError("Bitte fuege mindestens einen Termin hinzu.");
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
      formData.set(
        "sessions_json",
        JSON.stringify(
          sessions.map((session) => ({
            starts_at: session.starts_at,
            ends_at: session.ends_at,
          }))
        )
      );
      const result = await createWorkshopAction(formData);
      if (typeof result === "string" && result) {
        setError(result);
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
            className="w-full rounded-xl border px-3 py-2 text-sm"
            placeholder="z. B. Keramik-Weekend"
          />
        </label>

        <label className="space-y-1">
          <span className="text-sm font-medium">Ort</span>
          <input
            name="location"
            className="w-full rounded-xl border px-3 py-2 text-sm"
            placeholder="z. B. Studio Mitte"
          />
        </label>
      </div>

      <label className="space-y-1 block">
        <span className="text-sm font-medium">Beschreibung</span>
        <textarea
          name="description"
          rows={4}
          className="w-full rounded-xl border px-3 py-2 text-sm"
          placeholder="Kurzbeschreibung fuer die Angebotsseite."
        />
      </label>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <span className="text-sm font-medium">Termine *</span>
            <p className="text-xs text-muted-foreground">
              Jeder Termin benoetigt Start- und Endzeit.
            </p>
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
              <div key={session.id} className="rounded-xl border p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-muted-foreground">
                    Termin {index + 1}
                  </p>
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
                            item.id === session.id
                              ? { ...item, starts_at: event.target.value }
                              : item
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
                            item.id === session.id
                              ? { ...item, ends_at: event.target.value }
                              : item
                          )
                        )
                      }
                      className="w-full rounded-xl border px-3 py-2 text-sm"
                      required
                    />
                  </label>
                </div>

                {sessionError ? (
                  <p className="text-xs text-red-600">{sessionError}</p>
                ) : null}
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
            className="w-full rounded-xl border px-3 py-2 text-sm"
            placeholder="49.00"
          />
          <span className="block text-xs text-muted-foreground">
            Wird intern in Cent gespeichert.
          </span>
        </label>

        <label className="space-y-1">
          <span className="text-sm font-medium">Waehrung *</span>
          <input
            name="currency"
            required
            defaultValue="EUR"
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
        {pending ? "Speichert..." : "Workshop erstellen"}
      </button>
    </form>
  );
}
