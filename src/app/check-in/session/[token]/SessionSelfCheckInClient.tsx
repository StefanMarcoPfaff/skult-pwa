"use client";

import { useMemo, useState } from "react";
import { readStoredTicketQrTokens } from "@/lib/ticket-device-store";

type Props = {
  sessionToken: string;
  offerTitle: string;
  eventLabel: string;
  location: string | null;
};

type SubmitState = {
  tone: "neutral" | "success" | "danger";
  message: string;
};

export default function SessionSelfCheckInClient(props: Props) {
  const [manualToken, setManualToken] = useState("");
  const [busyToken, setBusyToken] = useState<string | null>(null);
  const [state, setState] = useState<SubmitState | null>(null);
  const localTokens = useMemo(() => readStoredTicketQrTokens(), []);

  async function submit(ticketToken: string) {
    const trimmed = ticketToken.trim();
    if (!trimmed) return;

    setBusyToken(trimmed);
    setState(null);

    try {
      const response = await fetch("/api/attendance/session-self-checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionToken: props.sessionToken,
          ticketToken: trimmed,
        }),
      });

      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        alreadyPresent?: boolean;
      };

      if (!response.ok || !data.ok) {
        setState({
          tone: "danger",
          message: data.error ?? "Self check-in konnte nicht abgeschlossen werden.",
        });
        return;
      }

      setState({
        tone: "success",
        message: data.alreadyPresent
          ? "Deine Anwesenheit war für diesen Termin bereits erfasst."
          : "Deine Anwesenheit wurde erfolgreich gespeichert.",
      });
    } finally {
      setBusyToken(null);
    }
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Termin-Check-in</h1>
        <p className="text-sm text-muted-foreground">
          {props.offerTitle} | {props.eventLabel}
        </p>
        {props.location ? <p className="text-sm text-muted-foreground">Ort: {props.location}</p> : null}
      </header>

      {state ? (
        <section
          className={`rounded-2xl border p-4 text-sm ${
            state.tone === "success"
              ? "border-green-200 bg-green-50 text-green-800"
              : state.tone === "danger"
                ? "border-red-200 bg-red-50 text-red-800"
                : ""
          }`}
        >
          {state.message}
        </section>
      ) : null}

      <section className="rounded-2xl border p-5">
        <h2 className="text-lg font-semibold">Schneller Check-in auf diesem Gerät</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Wenn dein Ticket bereits auf diesem Smartphone geöffnet wurde, kannst du es hier direkt verwenden.
        </p>

        {localTokens.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Auf diesem Gerät wurde noch kein Ticket gespeichert. Nutze unten deinen Ticket-Token als Fallback.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {localTokens.map((token) => (
              <button
                key={token}
                type="button"
                disabled={busyToken === token}
                onClick={() => void submit(token)}
                className="flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm font-medium disabled:opacity-60"
              >
                <span>Gespeichertes Ticket verwenden</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {token.slice(0, 8)}...{token.slice(-4)}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border p-5">
        <h2 className="text-lg font-semibold">Fallback mit Ticket-Token</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Falls dein Ticket nicht auf diesem Gerät gespeichert ist, gib den Token aus deiner Ticketansicht ein.
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input
            value={manualToken}
            onChange={(event) => setManualToken(event.target.value)}
            placeholder="Ticket-Token eingeben"
            className="min-w-0 flex-1 rounded-xl border px-4 py-3 text-sm"
          />
          <button
            type="button"
            disabled={!manualToken.trim() || Boolean(busyToken)}
            onClick={() => void submit(manualToken)}
            className="rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            Einchecken
          </button>
        </div>
      </section>
    </main>
  );
}
