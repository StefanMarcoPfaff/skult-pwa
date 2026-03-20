"use client";

import { useEffect } from "react";
import Link from "next/link";
import QRCode from "react-qr-code";
import { buildTicketCheckInUrl } from "@/lib/ticket-qr";

export type WorkshopSuccessData = {
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
  providerType?: "independent_teacher" | "studio_provider" | null;
  instructorName?: string | null;
  stornoPolicyLabel?: string | null;
  priceLabel?: string | null;
  qrToken?: string | null;
  error?: string;
};

type Props = {
  bookingData: WorkshopSuccessData | null;
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

export default function SuccessClient({ bookingData }: Props) {
  useEffect(() => {
    if (bookingData?.status === "paid" && bookingData.attendeeKey) {
      addTicketKeyToLocalStorage(bookingData.attendeeKey);
    }
  }, [bookingData?.attendeeKey, bookingData?.status]);

  const paid = bookingData?.status === "paid";
  const checkInUrl = bookingData?.qrToken ? buildTicketCheckInUrl(bookingData.qrToken) : null;

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <section className="rounded-2xl border p-6">
        <h1 className="text-4xl font-extrabold">Deine Buchung war erfolgreich! 🎉</h1>

        {bookingData?.error ? (
          <p className="mt-3 text-base text-muted-foreground">
            Wir konnten deine Buchung gerade nicht vollständig laden. Bitte öffne die Seite erneut
            über den Link in deiner Bestätigung oder prüfe deine E-Mails.
          </p>
        ) : paid ? (
          <div className="mt-3 space-y-2 text-sm text-muted-foreground">
            <p>Deine Zahlung wurde bestätigt und dein Workshop-Ticket ist bereit.</p>
            <p>Alle weiteren Informationen zu deinem Workshop erhältst du per E-Mail.</p>
          </div>
        ) : (
          <p className="mt-3 text-base text-muted-foreground">
            Wir konnten noch keinen abgeschlossenen Zahlungseingang für diese Buchung finden.
          </p>
        )}
      </section>

      {paid && bookingData ? (
        <section className="rounded-2xl border p-6">
          <h2 className="text-xl font-semibold">{bookingData.workshopTitle ?? "Workshop"}</h2>
          <div className="mt-4 space-y-2 text-sm text-muted-foreground">
            {bookingData.providerType === "studio_provider" && bookingData.providerName ? (
              <p>
                Anbieter:{" "}
                <span className="font-medium text-foreground">{bookingData.providerName}</span>
              </p>
            ) : null}
            {bookingData.instructorName ? (
              <p>
                Dozent*in:{" "}
                <span className="font-medium text-foreground">{bookingData.instructorName}</span>
              </p>
            ) : null}
            {bookingData.location ? (
              <p>
                Ort: <span className="font-medium text-foreground">{bookingData.location}</span>
              </p>
            ) : null}
            {bookingData.locationDetails ? (
              <p>
                Ort / Zusatzinfo:{" "}
                <span className="font-medium text-foreground">{bookingData.locationDetails}</span>
              </p>
            ) : null}
            {bookingData.sessionLines && bookingData.sessionLines.length > 0 ? (
              <div>
                <p>Datum / Zeiten:</p>
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

      {paid && bookingData?.qrToken && checkInUrl ? (
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
        <Link
          href="/tickets"
          className="inline-flex rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white"
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
