import Link from "next/link";
import QRCode from "react-qr-code";
import { buildBookingCalendarPath } from "@/lib/calendar";
import {
  finalizeCourseRegistrationCheckoutSession,
  type CourseRegistrationFinalizeResult,
} from "@/lib/course-registration-finalization";
import { buildTicketCheckInUrl } from "@/lib/ticket-qr";
import type { TicketRow } from "@/lib/tickets";

export default async function TrialRegistrationSuccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ session_id?: string; intentId?: string }>;
}) {
  const { token } = await params;
  const { session_id, intentId } = await searchParams;
  let ticketForDisplay: TicketRow | null = null;
  let courseTitleForDisplay = "Laufendes Angebot";
  let priceLabelForDisplay: string | null = null;
  let checkoutState: CourseRegistrationFinalizeResult["kind"] | null = null;

  if (session_id && intentId) {
    const result = await finalizeCourseRegistrationCheckoutSession({
      sessionId: session_id,
      expectedIntentId: intentId,
    });

    checkoutState = result.kind;

    if (result.kind === "completed") {
      ticketForDisplay = result.ticket;
      courseTitleForDisplay = result.courseTitle;
      priceLabelForDisplay = result.priceLabel;
    }
  }

  const ticketCheckInUrl = ticketForDisplay?.qr_token
    ? buildTicketCheckInUrl(ticketForDisplay.qr_token)
    : null;

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <section className="rounded-2xl border p-6">
        <h1 className="text-2xl font-semibold">
          {checkoutState === "pending"
            ? "Deine Zahlung wird noch bestaetigt."
            : "Deine Anmeldung war erfolgreich!"}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {checkoutState === "pending"
            ? "Sobald Stripe die Subscription-Zahlung bestaetigt hat, wird deine Anmeldung automatisch abgeschlossen und du erhaeltst die weiteren Informationen per E-Mail."
            : "Alle weiteren Informationen zu deinem laufenden Angebot erhaeltst du per E-Mail."}
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          {ticketForDisplay?.qr_token ? (
            <Link
              href={buildBookingCalendarPath(ticketForDisplay.qr_token, "ticket")}
              className="inline-flex rounded-xl border px-4 py-2 text-sm font-semibold"
            >
              Zum Kalender hinzufügen
            </Link>
          ) : null}
          <Link href="/courses" className="inline-flex rounded-xl border px-4 py-2 text-sm font-semibold">
            Zu den Angeboten
          </Link>
          <Link
            href={`/trial/register/${token}`}
            className="inline-flex rounded-xl border px-4 py-2 text-sm font-semibold"
          >
            Anmeldedaten ansehen
          </Link>
        </div>
      </section>

      {ticketForDisplay && ticketCheckInUrl ? (
        <section className="rounded-2xl border p-6">
          <h2 className="text-xl font-semibold">Dein Ticket</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Zeige diesen QR-Code kuenftig fuer Anwesenheit und Check-in in {courseTitleForDisplay} vor.
          </p>
          <div className="mt-4 inline-block rounded-2xl border bg-white p-4">
            <QRCode value={ticketCheckInUrl} size={220} />
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href={`/trial/register/${token}`}
              className="inline-flex rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white"
            >
              Ticket in den Anmeldedaten ansehen
            </Link>
          </div>
        </section>
      ) : null}

      {priceLabelForDisplay ? (
        <section className="rounded-2xl border p-6">
          <h2 className="text-xl font-semibold">Deine Konditionen</h2>
          <div className="mt-3 space-y-2 text-sm text-muted-foreground">
            <p>
              Preis: <span className="font-medium text-foreground">{priceLabelForDisplay}</span>
            </p>
            <p>
              Abrechnung: <span className="font-medium text-foreground">monatlich ab Buchungsdatum</span>
            </p>
            <p>
              Kuendigung:{" "}
              <span className="font-medium text-foreground">
                monatlich zum Ende des Abrechnungszeitraums moeglich.
              </span>
            </p>
          </div>
        </section>
      ) : null}
    </main>
  );
}
