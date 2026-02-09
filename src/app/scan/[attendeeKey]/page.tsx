import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

export default async function ScanPage({
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

  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ fontSize: 38, fontWeight: 800 }}>Ticket-Check</h1>

      {!data ? (
        <p style={{ marginTop: 12, fontSize: 18 }}>❌ Ticket nicht gefunden.</p>
      ) : data.status === "paid" ? (
        <p style={{ marginTop: 12, fontSize: 18 }}>✅ Bezahlt / gültig.</p>
      ) : (
        <p style={{ marginTop: 12, fontSize: 18 }}>⚠️ Status: {data.status}</p>
      )}

      <p style={{ marginTop: 16, fontFamily: "monospace" }}>
        bookingId: {data?.id ?? "—"}
      </p>
    </main>
  );
}
