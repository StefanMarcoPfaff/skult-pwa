"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Props = {
  sessionId: string;
};

type ApiResponse = {
  bookingId?: string;
  status?: string | null;
  attendeeKey?: string | null;
  courseId?: string | null;
  error?: string;
};

const LS_KEY = "skult_ticket_keys";

function addTicketKeyToLocalStorage(attendeeKey: string) {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const list: string[] = raw ? JSON.parse(raw) : [];
    if (!list.includes(attendeeKey)) {
      list.unshift(attendeeKey);
      localStorage.setItem(LS_KEY, JSON.stringify(list));
    }
  } catch {
    // ignore
  }
}

export default function SuccessClient({ sessionId }: Props) {
  const [status, setStatus] = useState<string | null>(null);
  const [attendeeKey, setAttendeeKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function fetchStatus() {
      try {
        const res = await fetch(
          `/api/bookings/by-session?session_id=${encodeURIComponent(sessionId)}`,
          { cache: "no-store" }
        );
        const json = (await res.json()) as ApiResponse;

        if (!active) return;

        if (json.error) {
          setError(json.error);
          return;
        }

        setStatus(json.status ?? null);
        setAttendeeKey(json.attendeeKey ?? null);

        if (json.status === "paid" && json.attendeeKey) {
          addTicketKeyToLocalStorage(json.attendeeKey);
        }
      } catch (e: any) {
        if (!active) return;
        setError(e?.message ?? "fetch failed");
      }
    }

    // sofort
    fetchStatus();

    // poll alle 2s bis paid
    const id = setInterval(() => {
      if (status !== "paid") fetchStatus();
    }, 2000);

    return () => {
      active = false;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, status]);

  const paid = status === "paid";

  return (
    <main style={{ padding: 24, maxWidth: 720, margin: "0 auto" }}>
      <h1 style={{ fontSize: 44, fontWeight: 800, marginBottom: 8 }}>
        Zahlung erfolgreich ✅
      </h1>

      {error ? (
        <p style={{ fontSize: 18, marginTop: 12 }}>
          Hinweis: Wir konnten den Status gerade nicht laden. Bitte aktualisiere die Seite.
        </p>
      ) : paid ? (
        <p style={{ fontSize: 20, marginTop: 12 }}>
          Danke! Deine Buchung ist als bezahlt gespeichert. 🎟️
        </p>
      ) : (
        <p style={{ fontSize: 20, marginTop: 12 }}>
          Danke! Wir bestätigen deine Zahlung gerade noch – diese Seite aktualisiert sich automatisch…
        </p>
      )}

      <div style={{ marginTop: 28, display: "flex", gap: 14, flexWrap: "wrap" }}>
        {paid && attendeeKey ? (
          <Link
            href={`/ticket/${attendeeKey}`}
            style={{
              padding: "14px 18px",
              borderRadius: 12,
              background: "black",
              color: "white",
              textDecoration: "none",
              fontWeight: 700,
            }}
          >
            Ticket anzeigen
          </Link>
        ) : (
          <span
            style={{
              padding: "14px 18px",
              borderRadius: 12,
              background: "#eee",
              color: "#555",
              fontWeight: 700,
            }}
          >
            Ticket wird vorbereitet…
          </span>
        )}

        <Link
          href="/tickets"
          style={{
            padding: "14px 18px",
            borderRadius: 12,
            border: "1px solid #ddd",
            textDecoration: "none",
            fontWeight: 700,
          }}
        >
          Meine Tickets
        </Link>

        <Link href="/courses" style={{ alignSelf: "center" }}>
          Alle Kurse
        </Link>
      </div>
    </main>
  );
}
