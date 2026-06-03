import Link from "next/link";
import QRCode from "react-qr-code";
import OfferSummaryCard from "@/components/offer/OfferSummaryCard";
import { TicketQrTokenSaver } from "@/components/tickets/TicketQrTokenSaver";
import { buildTicketCheckInUrl } from "@/lib/ticket-qr";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import type { ProviderType } from "@/lib/provider-profiles";
import { buildOfferViewModel } from "@/lib/offers/offer-view-model";
import { formatWorkshopSessionLine } from "@/lib/workshop-offer-display";

export const runtime = "nodejs";

function shortKey(key: string) {
  return key.length > 10 ? `${key.slice(0, 6)}...${key.slice(-4)}` : key;
}

export default async function TicketPage({
  params,
}: {
  params: Promise<{ attendeeKey: string }>;
}) {
  const { attendeeKey } = await params;
  const supabase = createSupabaseAdmin();

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
      .from("courses")
      .select("id,title,location,location_details,starts_at,teacher_id,instructor_name,offer_image_url")
      .eq("id", booking.course_id)
      .maybeSingle();
    course = data;
  }

  const [{ data: sessions }, { data: profile }] = await Promise.all([
    booking?.course_id
      ? supabase
          .from("course_sessions")
          .select("starts_at,ends_at")
          .eq("course_id", booking.course_id)
          .order("starts_at", { ascending: true })
      : Promise.resolve({ data: [] as Array<{ starts_at: string | null; ends_at: string | null }> }),
    typeof course?.teacher_id === "string"
      ? supabase
          .from("profiles")
          .select("first_name,last_name,provider_type,organization_name,photo_url,company_logo_url")
          .eq("id", course.teacher_id)
          .maybeSingle<{
            first_name: string | null;
            last_name: string | null;
            provider_type: ProviderType | null;
            organization_name: string | null;
            photo_url: string | null;
            company_logo_url: string | null;
          }>()
      : Promise.resolve({ data: null }),
  ]);
  const sessionLines = (sessions ?? []).map((session) => formatWorkshopSessionLine(session.starts_at, session.ends_at));
  const offerViewModel = buildOfferViewModel({
    course: {
      title: typeof course?.title === "string" ? course.title : "Angebot",
      kind: "workshop",
      location: typeof course?.location === "string" ? course.location : null,
      location_details: typeof course?.location_details === "string" ? course.location_details : null,
      starts_at: typeof course?.starts_at === "string" ? course.starts_at : null,
      instructor_name: typeof course?.instructor_name === "string" ? course.instructor_name : null,
      offer_image_url: typeof course?.offer_image_url === "string" ? course.offer_image_url : null,
    },
    providerProfile: profile
      ? {
          provider_type: profile.provider_type,
          organization_name: profile.organization_name,
          first_name: profile.first_name,
          last_name: profile.last_name,
          photo_url: profile.photo_url,
          company_logo_url: profile.company_logo_url,
        }
      : null,
    sessions: sessions ?? [],
  });
  if (sessionLines.length > 0) {
    offerViewModel.sessions = sessionLines.map((line) => ({
      dateLabel: line,
      timeLabel: line,
      dateTimeLabel: line,
      startsAtBerlin: null,
      endsAtBerlin: null,
    }));
  }

  const status = booking?.status ?? null;
  const paid = status === "paid";
  const verifyUrl = ticket?.qr_token
    ? buildTicketCheckInUrl(ticket.qr_token)
    : `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/scan/${attendeeKey}`;

  return (
    <main style={{ padding: 24, maxWidth: 820, margin: "0 auto" }}>
      <TicketQrTokenSaver qrToken={ticket?.qr_token ?? null} />
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

      <div style={{ marginTop: 22 }}>
        <OfferSummaryCard viewModel={offerViewModel} compact showTicketInfo />
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
            Bitte zeige dieses Ticket beim Einlass vor. Der Check-in wird ausschließlich vom Team vor Ort ausgelöst.
          </div>

          <Link href="/courses">Alle Angebote</Link>
        </div>
      </div>
    </main>
  );
}
