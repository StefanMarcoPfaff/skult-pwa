import { getProviderDisplayName, getWorkshopStornoPolicyLabel } from "@/lib/provider-profiles";
import { getStripe } from "@/lib/stripe";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { issueWorkshopTicketForBooking, type TicketRow } from "@/lib/tickets";
import {
  sendWorkshopBookingNotificationEmail,
  sendWorkshopCustomerBookingConfirmationEmail,
} from "@/lib/workshop-booking-emails";

type BookingRow = {
  id: string;
  status: string | null;
  course_id: string | null;
  attendee_key: string | null;
  customer_first_name: string | null;
  customer_last_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  workshop_confirmation_email_sent_at: string | null;
  workshop_provider_notification_email_sent_at: string | null;
};

type CourseRow = {
  id: string;
  title: string | null;
  location: string | null;
  location_details: string | null;
  teacher_id: string | null;
  instructor_name: string | null;
  workshop_storno_policy: string | null;
  price_cents: number | null;
  currency: string | null;
};

type SessionRow = {
  starts_at: string | null;
  ends_at: string | null;
};

type ProfileRow = {
  first_name: string | null;
  last_name: string | null;
  provider_type: "independent_teacher" | "studio_provider" | null;
  organization_name: string | null;
  photo_url: string | null;
};

type ProviderContact = {
  providerType: "independent_teacher" | "studio_provider" | null;
  providerName: string | null;
  providerEmail: string | null;
  providerContactName: string | null;
  senderImageUrl: string | null;
};

function isDev() {
  return process.env.NODE_ENV !== "production";
}

function logWorkshopFinalization(message: string, payload: Record<string, unknown>) {
  if (!isDev()) return;
  console.log("[workshop booking finalization]", message, payload);
}

function formatPrice(priceCents: number | null, currency: string | null): string | null {
  if (priceCents === null || !Number.isFinite(priceCents)) return null;
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: currency || "EUR",
  }).format(priceCents / 100);
}

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

async function resolveWorkshopProviderContact(
  admin: ReturnType<typeof createSupabaseAdmin>,
  course: CourseRow | null
): Promise<ProviderContact> {
  if (!course?.teacher_id) {
    return {
      providerType: null,
      providerName: null,
      providerEmail: null,
      providerContactName: null,
      senderImageUrl: null,
    };
  }

  const [{ data: profile }, authResult] = await Promise.all([
    admin
      .from("profiles")
      .select("first_name,last_name,provider_type,organization_name,photo_url")
      .eq("id", course.teacher_id)
      .maybeSingle<ProfileRow>(),
    admin.auth.admin.getUserById(course.teacher_id),
  ]);

  const providerName =
    profile?.provider_type ? getProviderDisplayName(profile.provider_type, profile) : null;
  const providerContactName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim() || null;
  const providerEmail = authResult.data.user?.email?.trim() || null;

  return {
    providerType: profile?.provider_type ?? null,
    providerName,
    providerEmail,
    providerContactName,
    senderImageUrl: profile?.photo_url ?? null,
  };
}

export type FinalizedWorkshopBooking = {
  bookingId: string;
  courseId: string | null;
  status: string | null;
  attendeeKey: string | null;
  ticket: TicketRow | null;
  workshopTitle: string | null;
  customerName: string;
  customerEmail: string | null;
  location: string | null;
  locationDetails: string | null;
  sessionLines: string[];
  providerType: "independent_teacher" | "studio_provider" | null;
  providerName: string | null;
  instructorName: string | null;
  stornoPolicyLabel: string | null;
  priceLabel: string | null;
};

export async function finalizeWorkshopBookingBySession(
  sessionId: string
): Promise<FinalizedWorkshopBooking | null> {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  const bookingId = session.metadata?.bookingId ?? session.client_reference_id ?? null;

  if (!bookingId || session.payment_status !== "paid") {
    return null;
  }

  const admin = createSupabaseAdmin();
  const { data: booking } = await admin
    .from("bookings")
    .select(
      "id,status,course_id,attendee_key,customer_first_name,customer_last_name,customer_email,customer_phone,workshop_confirmation_email_sent_at"
        + ",workshop_provider_notification_email_sent_at"
    )
    .eq("id", bookingId)
    .maybeSingle<BookingRow>();

  if (!booking) return null;

  const stripeEmail = session.customer_details?.email ?? session.customer_email ?? null;
  const stripeName = session.customer_details?.name?.trim() || null;
  const customerName =
    [booking.customer_first_name, booking.customer_last_name].filter(Boolean).join(" ").trim() ||
    stripeName ||
    "Workshop-Gast";
  const customerEmail = booking.customer_email?.trim() || stripeEmail;

  await admin
    .from("bookings")
    .update({
      status: "paid",
      stripe_session_id: session.id,
      payment_session_id: session.id,
      payment_provider: "stripe",
      customer_email: customerEmail,
    })
    .eq("id", booking.id);

  const ticketResult =
    customerEmail
      ? await issueWorkshopTicketForBooking({
          bookingId: booking.id,
          courseId: booking.course_id,
          customerName,
          customerEmail,
        })
      : null;

  const ticket = ticketResult?.ticket ?? null;

  const [{ data: course }, { data: workshopSessions }] = await Promise.all([
    booking.course_id
      ? admin
          .from("courses")
          .select(
            "id,title,location,location_details,teacher_id,instructor_name,workshop_storno_policy,price_cents,currency"
          )
          .eq("id", booking.course_id)
          .maybeSingle<CourseRow>()
      : Promise.resolve({ data: null }),
    booking.course_id
      ? admin
          .from("course_sessions")
          .select("starts_at,ends_at")
          .eq("course_id", booking.course_id)
          .order("starts_at", { ascending: true })
          .returns<SessionRow[]>()
      : Promise.resolve({ data: [] as SessionRow[] }),
  ]);

  const providerContact = await resolveWorkshopProviderContact(admin, course ?? null);
  const sessionLines =
    (workshopSessions ?? []).length > 0
      ? (workshopSessions ?? []).map((item) => formatSessionLine(item.starts_at, item.ends_at))
      : [];

  if (ticket && customerEmail && !booking.workshop_confirmation_email_sent_at) {
    try {
      logWorkshopFinalization("customer confirmation email attempt", {
        bookingId: booking.id,
        recipient: customerEmail,
      });

      const result = await sendWorkshopCustomerBookingConfirmationEmail({
        bookingId: booking.id,
        workshopTitle: course?.title ?? "Workshop",
        providerType: providerContact.providerType,
        providerName: providerContact.providerName,
        teacherName: course?.instructor_name ?? null,
        teacherEmail: null,
        senderDisplayName:
          providerContact.providerType === "studio_provider"
            ? providerContact.providerName
            : course?.instructor_name ?? providerContact.providerContactName,
        senderImageUrl: providerContact.senderImageUrl,
        customerName,
        customerEmail,
        customerPhone: booking.customer_phone?.trim() || null,
        location: course?.location ?? null,
        locationDetails: course?.location_details ?? null,
        sessionLines,
        stornoPolicyLabel: getWorkshopStornoPolicyLabel(course?.workshop_storno_policy),
        priceLabel: formatPrice(course?.price_cents ?? null, course?.currency ?? null),
        qrToken: ticket.qr_token,
      });

      if (result?.error) {
        throw result.error;
      }

      await admin
        .from("bookings")
        .update({ workshop_confirmation_email_sent_at: new Date().toISOString() })
        .eq("id", booking.id)
        .is("workshop_confirmation_email_sent_at", null);

      logWorkshopFinalization("customer confirmation email sent", {
        bookingId: booking.id,
        recipient: customerEmail,
        messageId: result?.data?.id ?? null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logWorkshopFinalization("customer confirmation email failed", {
        bookingId: booking.id,
        recipient: customerEmail,
        reason: message,
      });
    }
  } else {
    logWorkshopFinalization("customer confirmation email skipped", {
      bookingId: booking.id,
      recipient: customerEmail,
      reason: ticket ? (customerEmail ? "already-sent" : "missing-recipient") : "missing-ticket",
      sentAtAlreadySet: Boolean(booking.workshop_confirmation_email_sent_at),
    });
  }

  const providerEmail = providerContact.providerEmail;
  if (ticket && providerEmail && !booking.workshop_provider_notification_email_sent_at) {
    const claimedAt = new Date().toISOString();
    const { data: claimedRows, error: claimError } = await admin
      .from("bookings")
      .update({ workshop_provider_notification_email_sent_at: claimedAt })
      .eq("id", booking.id)
      .is("workshop_provider_notification_email_sent_at", null)
      .select("id");

    if (claimError) {
      logWorkshopFinalization("provider notification email failed", {
        bookingId: booking.id,
        recipient: providerEmail,
        reason: claimError.message,
      });
    } else if (!claimedRows || claimedRows.length === 0) {
      logWorkshopFinalization("provider notification email skipped", {
        bookingId: booking.id,
        recipient: providerEmail,
        reason: "already-sent",
        sentAtAlreadySet: true,
      });
    } else {
      try {
        logWorkshopFinalization("provider notification email attempt", {
          bookingId: booking.id,
          recipient: providerEmail,
        });

        const result = await sendWorkshopBookingNotificationEmail({
          bookingId: booking.id,
          workshopTitle: course?.title ?? "Workshop",
          providerType: providerContact.providerType,
          providerName: providerContact.providerName,
          teacherName: providerContact.providerContactName,
          teacherEmail: providerEmail,
          senderDisplayName:
            providerContact.providerType === "studio_provider"
              ? providerContact.providerName
              : providerContact.providerContactName,
          senderImageUrl: providerContact.senderImageUrl,
          customerName,
          customerEmail: customerEmail ?? "",
          customerPhone: booking.customer_phone?.trim() || null,
          location: course?.location ?? null,
          locationDetails: course?.location_details ?? null,
          sessionLines,
          stornoPolicyLabel: getWorkshopStornoPolicyLabel(course?.workshop_storno_policy),
          priceLabel: formatPrice(course?.price_cents ?? null, course?.currency ?? null),
          qrToken: ticket.qr_token,
        });

        if (result?.error) {
          throw result.error;
        }

        logWorkshopFinalization("provider notification email sent", {
          bookingId: booking.id,
          recipient: providerEmail,
          messageId: result?.data?.id ?? null,
        });
      } catch (error) {
        await admin
          .from("bookings")
          .update({ workshop_provider_notification_email_sent_at: null })
          .eq("id", booking.id)
          .eq("workshop_provider_notification_email_sent_at", claimedAt);

        const message = error instanceof Error ? error.message : String(error);
        logWorkshopFinalization("provider notification email failed", {
          bookingId: booking.id,
          recipient: providerEmail,
          reason: message,
        });
      }
    }
  } else {
    logWorkshopFinalization("provider notification email skipped", {
      bookingId: booking.id,
      recipient: providerEmail,
      reason: ticket ? (providerEmail ? "already-sent" : "missing-recipient") : "missing-ticket",
      sentAtAlreadySet: Boolean(booking.workshop_provider_notification_email_sent_at),
    });
  }

  return {
    bookingId: booking.id,
    courseId: booking.course_id,
    status: "paid",
    attendeeKey: booking.attendee_key,
    ticket,
    workshopTitle: course?.title ?? "Workshop",
    customerName,
    customerEmail,
    location: course?.location ?? null,
    locationDetails: course?.location_details ?? null,
    sessionLines,
    providerType: providerContact.providerType,
    providerName: providerContact.providerName,
    instructorName: course?.instructor_name ?? null,
    stornoPolicyLabel: getWorkshopStornoPolicyLabel(course?.workshop_storno_policy),
    priceLabel: formatPrice(course?.price_cents ?? null, course?.currency ?? null),
  };
}
