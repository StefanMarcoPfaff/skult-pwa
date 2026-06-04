"use client";

import { useEffect } from "react";
import Link from "next/link";
import QRCode from "react-qr-code";
import OfferSummaryCard from "@/components/offer/OfferSummaryCard";
import { buildBookingCalendarPath } from "@/lib/calendar";
import { buildOfferViewModel } from "@/lib/offers/offer-view-model";
import { storeTicketQrToken } from "@/lib/ticket-device-store";
import { buildTicketCheckInUrl } from "@/lib/ticket-qr";

export type WorkshopSuccessData = {
  bookingId?: string;
  status?: string | null;
  paymentStatus?: "paid" | "free" | null;
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
  priceCents?: number | null;
  currency?: string | null;
  providerLogoUrl?: string | null;
  providerPhotoUrl?: string | null;
  offerImageUrl?: string | null;
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
    if (bookingData?.status === "paid" && bookingData.qrToken) {
      storeTicketQrToken(bookingData.qrToken);
    }
  }, [bookingData?.attendeeKey, bookingData?.qrToken, bookingData?.status]);

  const paid = bookingData?.status === "paid";
  const isFreeBooking = bookingData?.paymentStatus === "free";
  const checkInUrl = bookingData?.qrToken ? buildTicketCheckInUrl(bookingData.qrToken) : null;
  const offerViewModel = bookingData
    ? buildOfferViewModel({
        course: {
          title: bookingData.workshopTitle,
          kind: "workshop",
          location: bookingData.location,
          location_details: bookingData.locationDetails,
          instructor_name: bookingData.instructorName,
          price_cents: bookingData.paymentStatus === "free" ? 0 : bookingData.priceCents ?? null,
          currency: bookingData.currency ?? null,
          offer_image_url: bookingData.offerImageUrl,
        },
        providerProfile: {
          provider_type: bookingData.providerType ?? null,
          organization_name: bookingData.providerName,
          first_name: bookingData.providerType === "studio_provider" ? null : bookingData.providerName,
          last_name: null,
          company_logo_url: bookingData.providerLogoUrl,
          photo_url: bookingData.providerPhotoUrl,
        },
        paymentStatus: bookingData.paymentStatus,
      })
    : null;
  if (offerViewModel && bookingData?.sessionLines?.length) {
    offerViewModel.sessions = bookingData.sessionLines.map((line) => ({
      dateLabel: line,
      timeLabel: line,
      dateTimeLabel: line,
      startsAtBerlin: null,
      endsAtBerlin: null,
    }));
    offerViewModel.cancellationLabel = bookingData.stornoPolicyLabel ?? null;
    offerViewModel.showCancellationTerms = !isFreeBooking && Boolean(bookingData.stornoPolicyLabel);
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <section className="rounded-2xl border p-6">
        <h1 className="text-4xl font-extrabold">Deine Reservation war erfolgreich!</h1>

        {bookingData?.error ? (
          <p className="mt-3 text-base text-muted-foreground">
            Wir konnten deine Buchung gerade nicht vollständig laden. Bitte öffne die Seite erneut
            über den Link in deiner Bestätigung oder prüfe deine E-Mails.
          </p>
        ) : paid ? (
          <div className="mt-3 space-y-3 text-sm text-muted-foreground">
            <div className="rounded-2xl border border-violet-100 bg-violet-50/70 p-4 text-base leading-7 text-slate-700 shadow-[0_1px_0_rgba(15,23,42,0.04)]">
              Eine Reservierungsbestätigung wird automatisch per E-Mail an Dich weitergeleitet. Bitte prüfe auch Deinen
              Spam-/Junk-Ordner.
            </div>
            {!isFreeBooking ? (
              <p>
                Deine Zahlung wurde bestätigt und bleibt bis zum Abschluss des Angebots sicher vorgemerkt. Sollte das
                Angebot durch die Anbietenden abgesagt werden, erhältst du automatisch eine Rückerstattung. Bei
                einer Stornierung durch dich gelten die jeweiligen Stornierungsbedingungen.
              </p>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 text-base text-muted-foreground">
            Wir konnten noch keinen abgeschlossenen Zahlungseingang für diese Buchung finden.
          </p>
        )}
      </section>

      {paid && bookingData ? (
        offerViewModel ? <OfferSummaryCard viewModel={offerViewModel} compact /> : null
      ) : null}

      {paid && bookingData?.qrToken && checkInUrl ? (
        <section className="rounded-2xl border p-6">
          <h2 className="text-xl font-semibold">Dein Ticket</h2>
          <p className="mt-2 text-sm text-muted-foreground">Bitte zeige diesen QR-Code beim Einlass vor.</p>
          <div className="mt-4 inline-block rounded-2xl border bg-white p-4">
            <QRCode value={checkInUrl} size={220} />
          </div>
        </section>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {paid && bookingData?.qrToken ? (
          <Link
            href={buildBookingCalendarPath(bookingData.qrToken, "ticket")}
            className="inline-flex rounded-xl border px-4 py-3 text-sm font-semibold"
          >
            Zum Kalender hinzufügen
          </Link>
        ) : null}
        <Link
          href="/tickets"
          className="inline-flex rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white"
        >
          Meine Tickets
        </Link>

        <Link href="/courses" className="inline-flex rounded-xl border px-4 py-3 text-sm font-semibold">
          Alle Angebote
        </Link>
      </div>
    </main>
  );
}
