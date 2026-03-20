import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { finalizeWorkshopBookingBySession } from "@/lib/workshop-booking-finalization";
import SuccessClient, { type WorkshopSuccessData } from "./SuccessClient";

type Props = {
  searchParams: Promise<{ session_id?: string }>;
};

export default async function SuccessPage({ searchParams }: Props) {
  const { session_id } = await searchParams;

  if (!session_id) {
    return <SuccessClient bookingData={{ error: "session_id fehlt" }} />;
  }

  const finalized = await finalizeWorkshopBookingBySession(session_id);
  if (finalized) {
    return (
      <SuccessClient
        bookingData={{
          bookingId: finalized.bookingId,
          status: finalized.status,
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

  const admin = createSupabaseAdmin();
  const { data: booking } = await admin
    .from("bookings")
    .select("id,status,attendee_key,course_id")
    .eq("payment_session_id", session_id)
    .maybeSingle<{
      id: string;
      status: string | null;
      attendee_key: string | null;
      course_id: string | null;
    }>();

  const fallbackData: WorkshopSuccessData = booking
    ? {
        bookingId: booking.id,
        status: booking.status,
        attendeeKey: booking.attendee_key,
        courseId: booking.course_id,
      }
    : {
        error: "Buchung konnte nicht geladen werden",
      };

  return <SuccessClient bookingData={fallbackData} />;
}
