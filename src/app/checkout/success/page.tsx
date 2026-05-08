import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { finalizeWorkshopBookingBySession } from "@/lib/workshop-booking-finalization";
import SuccessClient, { type WorkshopSuccessData } from "./SuccessClient";

type Props = {
  searchParams: Promise<{ session_id?: string; booking_id?: string }>;
};

function formatSessionLine(startsAt: string | null, endsAt: string | null): string {
  if (!startsAt) return "Termin folgt";

  const start = new Date(startsAt);
  const date = start.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const startTime = start.toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (!endsAt) return `${date} | ${startTime}`;

  const end = new Date(endsAt);
  const endTime = end.toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return `${date} | ${startTime}-${endTime}`;
}

export default async function SuccessPage({ searchParams }: Props) {
  const { session_id, booking_id } = await searchParams;

  if (!session_id && !booking_id) {
    return <SuccessClient bookingData={{ error: "session_id oder booking_id fehlt" }} />;
  }

  if (session_id) {
    const finalized = await finalizeWorkshopBookingBySession(session_id);
    if (finalized) {
      return (
        <SuccessClient
          bookingData={{
            bookingId: finalized.bookingId,
            status: finalized.status,
            paymentStatus: finalized.paymentStatus,
            attendeeKey: finalized.attendeeKey,
            courseId: finalized.courseId,
            workshopTitle: finalized.workshopTitle,
            customerName: finalized.customerName,
            customerEmail: finalized.customerEmail,
            location: finalized.location,
            locationDetails: finalized.locationDetails,
            sessionLines: finalized.sessionLines,
            providerName: finalized.providerName,
            instructorName: finalized.instructorName,
            stornoPolicyLabel: finalized.stornoPolicyLabel,
            priceLabel: finalized.priceLabel,
            qrToken: finalized.ticket?.qr_token ?? null,
          }}
        />
      );
    }
  }

  const admin = createSupabaseAdmin();
  const bookingQuery = booking_id
    ? admin
        .from("bookings")
        .select("id,status,payment_status,attendee_key,course_id,customer_first_name,customer_last_name,customer_email")
        .eq("id", booking_id)
    : admin
        .from("bookings")
        .select("id,status,payment_status,attendee_key,course_id,customer_first_name,customer_last_name,customer_email")
        .eq("payment_session_id", session_id as string);

  const { data: booking } = await bookingQuery.maybeSingle<{
    id: string;
    status: string | null;
    payment_status: string | null;
    attendee_key: string | null;
    course_id: string | null;
    customer_first_name: string | null;
    customer_last_name: string | null;
    customer_email: string | null;
  }>();

  if (!booking) {
    return <SuccessClient bookingData={{ error: "Buchung konnte nicht geladen werden" }} />;
  }

  const [{ data: ticket }, { data: course }, { data: sessions }] = await Promise.all([
    admin.from("tickets").select("qr_token").eq("booking_id", booking.id).maybeSingle<{ qr_token: string | null }>(),
    booking.course_id
      ? admin.from("courses").select("title,location,location_details").eq("id", booking.course_id).maybeSingle<{
          title: string | null;
          location: string | null;
          location_details: string | null;
        }>()
      : Promise.resolve({ data: null }),
    booking.course_id
      ? admin
          .from("course_sessions")
          .select("starts_at,ends_at")
          .eq("course_id", booking.course_id)
          .order("starts_at", { ascending: true })
      : Promise.resolve({ data: [] as Array<{ starts_at: string | null; ends_at: string | null }> }),
  ]);

  const fallbackData: WorkshopSuccessData = {
    bookingId: booking.id,
    status: booking.status,
    paymentStatus:
      booking.payment_status === "free" ? "free" : booking.payment_status === "paid" ? "paid" : null,
    attendeeKey: booking.attendee_key,
    courseId: booking.course_id,
    workshopTitle: course?.title ?? null,
    customerName: [booking.customer_first_name, booking.customer_last_name].filter(Boolean).join(" ").trim() || null,
    customerEmail: booking.customer_email,
    location: course?.location ?? null,
    locationDetails: course?.location_details ?? null,
    sessionLines: (sessions ?? []).map((session) => formatSessionLine(session.starts_at, session.ends_at)),
    qrToken: ticket?.qr_token ?? null,
  };

  return <SuccessClient bookingData={fallbackData} />;
}
