import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getProviderDisplayName, getWorkshopStornoPolicyLabel, type ProviderType } from "@/lib/provider-profiles";
import { finalizeWorkshopBookingBySession } from "@/lib/workshop-booking-finalization";
import { formatWorkshopPriceLabel, formatWorkshopSessionLine, shouldShowWorkshopCancellationPolicy } from "@/lib/workshop-offer-display";
import SuccessClient, { type WorkshopSuccessData } from "./SuccessClient";

type Props = {
  searchParams: Promise<{ session_id?: string; booking_id?: string }>;
};

function formatSessionLine(startsAt: string | null, endsAt: string | null): string {
  return formatWorkshopSessionLine(startsAt, endsAt);
}

export default async function SuccessPage({ searchParams }: Props) {
  const { session_id, booking_id } = await searchParams;

  if (!session_id && !booking_id) {
    return <SuccessClient bookingData={{ error: "Bestätigungsseite konnte nicht geladen werden: Buchungsreferenz fehlt." }} />;
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
            providerType: finalized.providerType,
            providerName: finalized.providerName,
            instructorName: finalized.instructorName,
            stornoPolicyLabel: finalized.stornoPolicyLabel,
            priceLabel: finalized.priceLabel,
            priceCents: finalized.priceCents,
            currency: finalized.currency,
            providerLogoUrl: finalized.providerLogoUrl,
            providerPhotoUrl: finalized.providerPhotoUrl,
            offerImageUrl: finalized.offerImageUrl,
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
    return <SuccessClient bookingData={{ error: "Bestätigungsseite konnte nicht geladen werden: Buchung konnte nicht geladen werden." }} />;
  }

  const [{ data: ticket }, { data: course }, { data: sessions }] = await Promise.all([
    admin.from("tickets").select("qr_token").eq("booking_id", booking.id).maybeSingle<{ qr_token: string | null }>(),
    booking.course_id
      ? admin.from("courses").select("title,location,location_details,teacher_id,instructor_name,workshop_storno_policy,price_cents,currency,offer_image_url").eq("id", booking.course_id).maybeSingle<{
          title: string | null;
          location: string | null;
          location_details: string | null;
          teacher_id: string | null;
          instructor_name: string | null;
          workshop_storno_policy: string | null;
          price_cents: number | null;
          currency: string | null;
          offer_image_url: string | null;
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

  const { data: profile } = course?.teacher_id
    ? await admin
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
    : { data: null };

  const providerName = profile?.provider_type ? getProviderDisplayName(profile.provider_type, profile) : null;
  const priceLabel = formatWorkshopPriceLabel(course?.price_cents ?? null, course?.currency ?? null, booking.payment_status);
  const stornoPolicyLabel = shouldShowWorkshopCancellationPolicy(course?.price_cents ?? null, booking.payment_status)
    ? getWorkshopStornoPolicyLabel(course?.workshop_storno_policy)
    : null;

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
    providerType: profile?.provider_type ?? null,
    providerName,
    instructorName: course?.instructor_name ?? null,
    priceLabel,
    priceCents: course?.price_cents ?? null,
    currency: course?.currency ?? null,
    stornoPolicyLabel,
    providerLogoUrl: profile?.company_logo_url ?? null,
    providerPhotoUrl: profile?.photo_url ?? null,
    offerImageUrl: course?.offer_image_url ?? null,
    qrToken: ticket?.qr_token ?? null,
  };

  return <SuccessClient bookingData={fallbackData} />;
}
