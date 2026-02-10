import Link from "next/link";
import QRCode from "react-qr-code";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

function shortKey(k: string) {
  return k.length > 10 ? `${k.slice(0, 6)}…${k.slice(-4)}` : k;
}

export default async function TicketPage({
  params,
}: {
  params: Promise<{ attendeeKey: string }>;
}) {
  const { attendeeKey } = await params;

  // Booking holen
  const { data: booking } = await supabase
    .from("bookings")
    .select("*")
    .eq("attendee_key", attendeeKey)
    .maybeSingle();

  // Kursinfos optional dazuladen
  let course: any = null;
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

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const verifyUrl = `${baseUrl}/scan/${attendeeKey}`;

  return (
    <main style={{ padding: 24, maxWidth: 820, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontSize: 44, fontWeight: 900, margin: 0 }}>Dein Ticket</h1>
          <p style={{ marginTop: 10, fontSize: 18 }}>
            Status:{" "}
            <b style={{ color: paid ? "green" : "crimson" }}>
              {paid ? "paid ✅" : status ?? "—"}
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
          {course?.title ?? "Workshop"}
        </div>

        {/* Optional: zeig ein paar Felder, falls vorhanden */}
        <div style={{ marginTop: 10, color: "#444", lineHeight: 1.5 }}>
          {course?.location ? <div>📍 {course.location}</div> : null}
          {course?.city ? <div>🏙️ {course.city}</div> : null}
          {course?.starts_at ? <div>🗓️ {String(course.starts_at)}</div> : null}
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
          Code: <b>{shortKey(attendeeKey)}</b>
        </div>

        <div style={{ marginTop: 18, display: "flex", gap: 14, flexWrap: "wrap" }}>
          <Link
            href={verifyUrl}
            style={{
              padding: "12px 16px",
              borderRadius: 12,
              border: "1px solid #ddd",
              textDecoration: "none",
              fontWeight: 700,
            }}
          >
            Scan-Link (Dozent*in)
          </Link>

          <Link href="/courses">Alle Kurse</Link>
        </div>
      </div>
    </main>
  );
}
