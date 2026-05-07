import Link from "next/link";
import QRCode from "react-qr-code";
import { TicketQrTokenSaver } from "@/components/tickets/TicketQrTokenSaver";
import { buildTicketCheckInUrl } from "@/lib/ticket-qr";
import { loadTicketByQrToken } from "@/lib/tickets";

function shortToken(token: string) {
  return token.length > 12 ? `${token.slice(0, 8)}...${token.slice(-4)}` : token;
}

export default async function TicketQrPage({
  params,
}: {
  params: Promise<{ qrToken: string }>;
}) {
  const { qrToken } = await params;
  const lookup = await loadTicketByQrToken(qrToken);

  if (!lookup) {
    return (
      <main className="mx-auto max-w-3xl space-y-6 p-6">
        <section className="rounded-2xl border p-6">
          <h1 className="text-3xl font-semibold">Ticket nicht gefunden</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Für diesen Ticket-Link wurde kein gültiges Ticket gefunden.
          </p>
          <Link href="/courses" className="mt-4 inline-flex rounded-xl border px-4 py-2 text-sm font-semibold">
            Alle Angebote
          </Link>
        </section>
      </main>
    );
  }

  const checkInUrl = buildTicketCheckInUrl(lookup.ticket.qr_token);

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <TicketQrTokenSaver qrToken={lookup.ticket.qr_token} />
      <section className="rounded-2xl border p-6">
        <h1 className="text-3xl font-semibold">Dein Ticket</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Dies ist deine Ticketansicht. Dein Ticket wird erst beim Check-in durch das Team vor Ort
          gescannt.
        </p>
      </section>

      <section className="rounded-2xl border p-6">
        <h2 className="text-xl font-semibold">{lookup.courseTitle ?? "Ticket"}</h2>
        <div className="mt-4 space-y-2 text-sm text-muted-foreground">
          <p>
            Name: <span className="font-medium text-foreground">{lookup.ticket.customer_name}</span>
          </p>
          <p>
            E-Mail: <span className="font-medium text-foreground">{lookup.ticket.customer_email}</span>
          </p>
          {lookup.courseLocation ? (
            <p>
              Ort: <span className="font-medium text-foreground">{lookup.courseLocation}</span>
            </p>
          ) : null}
          <p>
            Status: <span className="font-medium text-foreground">{lookup.ticket.status}</span>
          </p>
        </div>
      </section>

      <section className="rounded-2xl border p-6">
        <h2 className="text-xl font-semibold">QR-Ticket</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Bitte zeige diesen QR-Code beim Einlass vor. Der Check-in wird nur durch das Team vor Ort
          ausgelöst.
        </p>
        <div className="mt-4 inline-block rounded-2xl border bg-white p-4">
          <QRCode value={checkInUrl} size={240} />
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          Code:{" "}
          <span className="font-mono font-medium text-foreground">
            {shortToken(lookup.ticket.qr_token)}
          </span>
        </p>
      </section>

      <section id="wallet" className="rounded-2xl border p-6">
        <h2 className="text-xl font-semibold">Ins Wallet speichern</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Wallet-Pässe für Apple Wallet und Google Wallet sind technisch vorbereitet, aber in
          diesem MVP noch nicht als echte Pass-Datei aktiviert. Dieser Bereich ist der feste
          UI-Hook für den späteren Wallet-Export.
        </p>
      </section>

      <div className="flex flex-wrap gap-3">
        <Link href="/tickets" className="inline-flex rounded-xl border px-4 py-2 text-sm font-semibold">
          Meine Tickets
        </Link>
        <Link href="/courses" className="inline-flex rounded-xl border px-4 py-2 text-sm font-semibold">
          Alle Angebote
        </Link>
      </div>
    </main>
  );
}
