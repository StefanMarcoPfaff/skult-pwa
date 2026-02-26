"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
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

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
    >
      Speichern
    </button>
  );
}

export default function WorkshopForm() {
  const [error, setError] = useState<string | null>(null);
  const [priceEur, setPriceEur] = useState("");
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

  const sessionsAsISO = useMemo(() => {
    return sessions.map((session) => {
      const start = session.starts_at ? new Date(session.starts_at) : null;
      const end = session.ends_at ? new Date(session.ends_at) : null;

      return {
        starts_at:
          start && !Number.isNaN(start.getTime()) ? start.toISOString() : "",
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

  const submitAction = async (formData: FormData) => {
    const title = String(formData.get("title") ?? "").trim();

    if (!title) {
      setError("Bitte gib einen Titel ein.");
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
    const result = await createWorkshopAction(formData);
    if (result?.error) {
      setError(result.error);
    }
  };

  return (
    <form action={submitAction} className="space-y-4">
      <input
        type="hidden"
        name="sessions_json"
        value={JSON.stringify(sessionsAsISO)}
        readOnly
      />
      <input type="hidden" name="price_cents" value={priceCentsOrEmpty} readOnly />

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
            Termin hinzufügen
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
            defaultValue="EUR"
            className="w-full rounded-xl border px-3 py-2 text-sm uppercase"
          />
        </label>
      </div>

      <p className="text-xs text-muted-foreground">Wird intern in Cent gespeichert.</p>

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  );
}
