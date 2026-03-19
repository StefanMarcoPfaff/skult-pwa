"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import QRCode from "react-qr-code";
import { buildTicketCheckInUrl } from "@/lib/ticket-qr";

type Props = {
  sessionId: string;
};

type ApiResponse = {
  bookingId?: string;
  status?: string | null;
  attendeeKey?: string | null;
  courseId?: string | null;
  workshopTitle?: string | null;
  customerName?: string | null;
  customerEmail?: string | null;
  location?: string | null;
  locationDetails?: string | null;
  sessionLines?: string[];
  providerName?: string | null;
  instructorName?: string | null;
  stornoPolicyLabel?: string | null;
  priceLabel?: string | null;
  qrToken?: string | null;
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
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [bookingData, setBookingData] = useState<ApiResponse | null>(null);
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

        setBookingData(json);
        setStatus(json.status ?? null);
        setAttendeeKey(json.attendeeKey ?? null);
        setQrToken(json.qrToken ?? null);

        if (json.status === "paid" && json.attendeeKey) {
          addTicketKeyToLocalStorage(json.attendeeKey);
        }
      } catch (error) {
        if (!active) return;
        const message = error instanceof Error ? error.message : "fetch failed";
        setError(message);
      }
    }

    fetchStatus();

    const id = setInterval(() => {
      if (status !== "paid") fetchStatus();
    }, 2000);

    return () => {
      active = false;
      clearInterval(id);
    };
  }, [sessionId, status]);

  const paid = status === "paid";
  const checkInUrl = qrToken ? buildTicketCheckInUrl(qrToken) : null;

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <section className="rounded-2xl border p-6">
        <h1 className="text-4xl font-extrabold">Deine Workshop-Buchung war erfolgreich.</h1>

        {error ? (
          <p className="mt-3 text-base text-muted-foreground">
            Hinweis: Wir konnten den Status gerade nicht vollstaendig laden. Bitte aktualisiere die Seite.
          </p>
        ) : paid ? (
          <div className="mt-3 space-y-2 text-sm text-muted-foreground">
            <p>Deine Zahlung wurde bestaetigt und dein Workshop-Ticket ist bereit.</p>
            <p>Alle weiteren Informationen erhaeltst du per E-Mail.</p>
          </div>
        ) : (
          <p className="mt-3 text-base text-muted-foreground">
            Wir bestaetigen deine Zahlung gerade noch. Diese Seite aktualisiert sich automatisch.
          </p>
        )}
      </section>

      {paid && bookingData ? (
        <section className="rounded-2xl border p-6">
          <h2 className="text-xl font-semibold">{bookingData.workshopTitle ?? "Workshop"}</h2>
          <div className="mt-4 space-y-2 text-sm text-muted-foreground">
            {bookingData.providerName ? <p>Anbieter: <span className="font-medium text-foreground">{bookingData.providerName}</span></p> : null}
            {bookingData.instructorName ? <p>Dozent*in: <span className="font-medium text-foreground">{bookingData.instructorName}</span></p> : null}
            {bookingData.priceLabel ? <p>Preis: <span className="font-medium text-foreground">{bookingData.priceLabel}</span></p> : null}
            {bookingData.location ? <p>Ort: <span className="font-medium text-foreground">{bookingData.location}</span></p> : null}
            {bookingData.locationDetails ? <p>Ort / Zusatzinfo: <span className="font-medium text-foreground">{bookingData.locationDetails}</span></p> : null}
            {bookingData.stornoPolicyLabel ? <p>Storno-Regel: <span className="font-medium text-foreground">{bookingData.stornoPolicyLabel}</span></p> : null}
            {bookingData.sessionLines && bookingData.sessionLines.length > 0 ? (
              <div>
                <p>Termine:</p>
                <ul className="ml-5 list-disc">
                  {bookingData.sessionLines.map((line) => (
                    <li key={line}>
                      <span className="font-medium text-foreground">{line}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {paid && qrToken && checkInUrl ? (
        <section className="rounded-2xl border p-6">
          <h2 className="text-xl font-semibold">Dein Workshop-Ticket</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Bitte zeige diesen QR-Code beim Einlass vor.
          </p>
          <div className="mt-4 inline-block rounded-2xl border bg-white p-4">
            <QRCode value={checkInUrl} size={220} />
          </div>
        </section>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {paid && attendeeKey ? (
          <Link
            href={`/ticket/${attendeeKey}`}
            className="inline-flex rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white"
          >
            Ticket anzeigen
          </Link>
        ) : (
          <span className="inline-flex rounded-xl bg-muted px-4 py-3 text-sm font-semibold text-muted-foreground">
            Ticket wird vorbereitet...
          </span>
        )}

        <Link
          href="/tickets"
          className="inline-flex rounded-xl border px-4 py-3 text-sm font-semibold"
        >
          Meine Tickets
        </Link>

        <Link href="/courses" className="inline-flex rounded-xl border px-4 py-3 text-sm font-semibold">
          Alle Kurse
        </Link>
      </div>
    </main>
  );
}
