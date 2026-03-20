import Link from "next/link";
import QRCode from "react-qr-code";
import { createClient } from "@supabase/supabase-js";
import { buildTicketCheckInUrl } from "@/lib/ticket-qr";

export const runtime = "nodejs";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

function shortKey(key: string) {
  return key.length > 10 ? `${key.slice(0, 6)}...${key.slice(-4)}` : key;
}

export default async function TicketPage({
  params,
}: {
  params: Promise<{ attendeeKey: string }>;
}) {
  const { attendeeKey } = await params;

  const { data: booking } = await supabase
    .from("bookings")
    .select("*")
    .eq("attendee_key", attendeeKey)
    .maybeSingle();

  const { data: ticket } = booking?.id
    ? await supabase
        .from("tickets")
        .select("qr_token,customer_name,customer_email,status,checked_in_at")
        .eq("booking_id", booking.id)
        .maybeSingle()
    : { data: null };

  let course: Record<string, unknown> | null = null;
  if (booking?.course_id) {
    const { data } = await supabase
      .from("courses_lite")
      .select("*")
      .eq("id", booking.course_id)
      .maybeSingle();
    course = data;
  }

  const status = booking?.status ?? null;
  const paid = status === "paid";
  const verifyUrl = ticket?.qr_token
    ? buildTicketCheckInUrl(ticket.qr_token)
    : `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/scan/${attendeeKey}`;

  return (
    <main style={{ padding: 24, maxWidth: 820, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontSize: 44, fontWeight: 900, margin: 0 }}>Dein Ticket</h1>
          <p style={{ marginTop: 10, fontSize: 18 }}>
            Status:{" "}
            <b style={{ color: paid ? "green" : "crimson" }}>
              {paid ? "paid" : status ?? "-"}
            </b>
          </p>
        </div>

        <Link href="/tickets" style={{ alignSelf: "center" }}>
          Meine Tickets
        </Link>
      </div>

      <div
        style={{
          marginTop: 22,
          padding: 18,
          borderRadius: 16,
          border: "1px solid #e5e5e5",
        }}
      >
        <div style={{ fontSize: 14, letterSpacing: 0.3, color: "#666" }}>Workshop</div>
        <div style={{ fontSize: 24, fontWeight: 800, marginTop: 6 }}>
          {typeof course?.title === "string" ? course.title : "Workshop"}
        </div>

        <div style={{ marginTop: 10, color: "#444", lineHeight: 1.5 }}>
          {ticket?.customer_name ? <div>Name: {ticket.customer_name}</div> : null}
          {ticket?.customer_email ? <div>E-Mail: {ticket.customer_email}</div> : null}
          {typeof course?.location === "string" ? <div>Ort: {course.location}</div> : null}
          {typeof course?.starts_at === "string" ? <div>Start: {String(course.starts_at)}</div> : null}
        </div>
      </div>

      <div style={{ marginTop: 26 }}>
        <div style={{ fontSize: 14, letterSpacing: 0.3, color: "#666", marginBottom: 10 }}>
          QR-Code beim Einlass vorzeigen
        </div>

        <div
          style={{
            background: "white",
            padding: 18,
            borderRadius: 16,
            display: "inline-block",
            border: "1px solid #eee",
          }}
        >
          <QRCode value={verifyUrl} size={260} />
        </div>

        <div style={{ marginTop: 14, fontFamily: "monospace", color: "#333" }}>
          Code: <b>{shortKey(ticket?.qr_token ?? attendeeKey)}</b>
        </div>

        <div style={{ marginTop: 18, display: "flex", gap: 14, flexWrap: "wrap" }}>
          <div style={{ color: "#555", maxWidth: 520 }}>
            Dieser QR-Code ist nur zur Ansicht. Der Check-in wird ausschließlich vom Team vor Ort ausgelöst.
          </div>

          <Link href="/courses">Alle Kurse</Link>
        </div>
      </div>
    </main>
  );
}
