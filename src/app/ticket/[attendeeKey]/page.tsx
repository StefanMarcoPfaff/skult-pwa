import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import QRCode from "react-qr-code";

export const runtime = "nodejs";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

export default async function TicketPage({
  params,
}: {
  params: Promise<{ attendeeKey: string }>;
}) {
  const { attendeeKey } = await params;

  const { data } = await supabase
    .from("bookings")
    .select("id,status,course_id,attendee_key,created_at")
    .eq("attendee_key", attendeeKey)
    .maybeSingle();

  const status = data?.status ?? null;

  // QR soll für Dozierende direkt eine "Scan/Verify" Seite öffnen
  const verifyUrl = `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/scan/${attendeeKey}`;

  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ fontSize: 38, fontWeight: 800 }}>Dein Ticket</h1>

      {status !== "paid" ? (
        <p style={{ marginTop: 12, fontSize: 18 }}>
          Status: <b>{status ?? "—"}</b> (noch nicht bezahlt oder noch nicht bestätigt)
        </p>
      ) : (
        <p style={{ marginTop: 12, fontSize: 18 }}>
          Status: <b>paid</b> ✅
        </p>
      )}

      <div style={{ marginTop: 24, background: "white", padding: 16, display: "inline-block" }}>
        <QRCode value={verifyUrl} size={220} />
      </div>

      <p style={{ marginTop: 12, fontFamily: "monospace" }}>
        Code: {attendeeKey}
      </p>

      <div style={{ marginTop: 24 }}>
        <Link href="/tickets">Meine Tickets</Link>
      </div>
    </main>
  );
}
