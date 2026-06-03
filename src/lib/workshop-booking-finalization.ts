import type Stripe from "stripe";
import { loadCustomerReceiptAttachmentForMail } from "@/lib/documents/financial-document-mail-attachments";
import { mirrorStripePaymentToLedger } from "@/lib/payments/ledger";
import { calculatePayoutAvailableAt } from "@/lib/payments/payout-eligibility";
import { getProviderDisplayName, getWorkshopStornoPolicyLabel } from "@/lib/provider-profiles";
import { getStripe } from "@/lib/stripe";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { issueWorkshopTicketForBooking, type TicketRow } from "@/lib/tickets";
import {
  sendWorkshopBookingNotificationEmail,
  sendWorkshopCustomerBookingConfirmationEmail,
} from "@/lib/workshop-booking-emails";
import {
  formatWorkshopPriceLabel,
  formatWorkshopSessionLine,
  shouldShowWorkshopCancellationPolicy,
} from "@/lib/workshop-offer-display";

type BookingRow = {
  id: string;
  status: string | null;
  course_id: string | null;
  attendee_key: string | null;
  customer_first_name: string | null;
  customer_last_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  payment_status: string | null;
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
  offer_image_url: string | null;
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
  company_logo_url: string | null;
  stripe_account_id: string | null;
};

type ProviderContact = {
  providerType: "independent_teacher" | "studio_provider" | null;
  providerName: string | null;
  providerEmail: string | null;
  providerContactName: string | null;
  senderImageUrl: string | null;
  providerLogoUrl: string | null;
  providerAccountId: string | null;
};

function isDev() {
  return process.env.NODE_ENV !== "production";
}

function logWorkshopFinalization(message: string, payload: Record<string, unknown>) {
  if (!isDev()) return;
  console.log("[workshop booking finalization]", message, payload);
}

function resolveLastWorkshopSessionEnd(sessions: SessionRow[] | null | undefined): string | null {
  const validEndTimestamps = (sessions ?? [])
    .map((session) => session.ends_at)
    .filter((value): value is string => Boolean(value))
    .map((value) => {
      const timestamp = new Date(value).getTime();
      return Number.isNaN(timestamp) ? null : timestamp;
    })
    .filter((value): value is number => value !== null);

  if (validEndTimestamps.length === 0) {
    return null;
  }

  return new Date(Math.max(...validEndTimestamps)).toISOString();
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
      providerLogoUrl: null,
      providerAccountId: null,
    };
  }

  const [{ data: profile }, authResult] = await Promise.all([
    admin
      .from("profiles")
      .select("first_name,last_name,provider_type,organization_name,photo_url,company_logo_url,stripe_account_id")
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
    providerLogoUrl: profile?.company_logo_url ?? null,
    providerAccountId: profile?.stripe_account_id ?? null,
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
  priceCents: number | null;
  currency: string | null;
  providerLogoUrl: string | null;
  providerPhotoUrl: string | null;
  offerImageUrl: string | null;
  paymentStatus: "paid" | "free";
};

async function finalizeWorkshopBookingRecord(input: {
  bookingId: string;
  paymentProvider: "stripe" | "free";
  paymentStatus: "paid" | "free";
  paymentSessionId?: string | null;
  customerEmail?: string | null;
  customerName?: string | null;
  stripeSession?: Stripe.Checkout.Session | null;
}): Promise<FinalizedWorkshopBooking | null> {
  const admin = createSupabaseAdmin();
  const { data: booking } = await admin
    .from("bookings")
    .select(
      "id,status,course_id,attendee_key,customer_first_name,customer_last_name,customer_email,customer_phone,payment_status,workshop_confirmation_email_sent_at"
        + ",workshop_provider_notification_email_sent_at"
    )
    .eq("id", input.bookingId)
    .maybeSingle<BookingRow>();

  if (!booking) return null;

  const customerName =
    [booking.customer_first_name, booking.customer_last_name].filter(Boolean).join(" ").trim() ||
    input.customerName ||
    "Gast";
  const customerEmail = booking.customer_email?.trim() || input.customerEmail?.trim() || null;

  await admin
    .from("bookings")
    .update({
      status: "paid",
      stripe_session_id: input.paymentProvider === "stripe" ? input.paymentSessionId ?? null : null,
      payment_session_id: input.paymentSessionId ?? null,
      payment_provider: input.paymentProvider,
      payment_status: input.paymentStatus,
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
  if (ticket) {
    logWorkshopFinalization("ticket created", {
      bookingId: booking.id,
      ticketId: ticket.id,
      paymentStatus: input.paymentStatus,
    });
  }

  const [{ data: course }, { data: workshopSessions }] = await Promise.all([
    booking.course_id
      ? admin
          .from("courses")
          .select(
            "id,title,location,location_details,teacher_id,instructor_name,workshop_storno_policy,price_cents,currency,offer_image_url"
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
      ? (workshopSessions ?? []).map((item) => formatWorkshopSessionLine(item.starts_at, item.ends_at))
      : [];
  const firstSessionStart = workshopSessions?.[0]?.starts_at ?? null;
  const lastSessionEnd = resolveLastWorkshopSessionEnd(workshopSessions ?? []);
  let paymentTransactionId: string | null = null;

  if (input.paymentProvider === "stripe" && input.paymentStatus === "paid" && input.stripeSession) {
    try {
      paymentTransactionId = await mirrorStripePaymentToLedger({
        bookingId: booking.id,
        teacherId: course?.teacher_id ?? null,
        providerType: providerContact.providerType,
        providerAccountId: providerContact.providerAccountId,
        accountHolderName: providerContact.providerName ?? providerContact.providerContactName,
        session: input.stripeSession,
        fallbackAmountCents: course?.price_cents ?? null,
        fallbackCurrency: course?.currency ?? null,
        payoutStatus: "pending_event_completion",
        availableAt: calculatePayoutAvailableAt({ eventEndsAt: lastSessionEnd }),
      });
    } catch (error) {
      logWorkshopFinalization("payment-v2 mirror failed", {
        bookingId: booking.id,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (ticket && customerEmail && !booking.workshop_confirmation_email_sent_at) {
    try {
      const attachments =
        input.paymentStatus === "paid"
          ? await loadCustomerReceiptAttachmentForMail({
              context: "workshop_customer_booking_confirmation",
              query: {
                bookingId: booking.id,
                paymentTransactionId,
              },
              supabase: admin,
            })
          : [];

      const stornoPolicyLabel = shouldShowWorkshopCancellationPolicy(course?.price_cents ?? null, input.paymentStatus)
        ? getWorkshopStornoPolicyLabel(course?.workshop_storno_policy)
        : null;
      const result = await sendWorkshopCustomerBookingConfirmationEmail({
        bookingId: booking.id,
        workshopTitle: course?.title ?? "Angebot",
        providerType: providerContact.providerType,
        providerName: providerContact.providerName,
        teacherName: course?.instructor_name ?? null,
        teacherEmail: providerContact.providerEmail,
        senderDisplayName:
          providerContact.providerType === "studio_provider"
            ? providerContact.providerName
            : course?.instructor_name ?? providerContact.providerContactName,
        senderImageUrl: providerContact.senderImageUrl,
        providerLogoUrl: providerContact.providerLogoUrl,
        customerName,
        customerEmail,
        customerPhone: booking.customer_phone?.trim() || null,
        location: course?.location ?? null,
        locationDetails: course?.location_details ?? null,
        startsAt: firstSessionStart,
        endsAt: lastSessionEnd,
        sessionLines,
        stornoPolicyLabel,
        priceLabel: formatWorkshopPriceLabel(course?.price_cents ?? null, course?.currency ?? null, input.paymentStatus),
        paymentStatus: input.paymentStatus,
        qrToken: ticket.qr_token,
        attachments,
      });

      if (result?.error) {
        throw result.error;
      }

      await admin
        .from("bookings")
        .update({ workshop_confirmation_email_sent_at: new Date().toISOString() })
        .eq("id", booking.id)
        .is("workshop_confirmation_email_sent_at", null);

      logWorkshopFinalization("customer mail sent", {
        bookingId: booking.id,
        recipient: customerEmail,
        paymentStatus: input.paymentStatus,
      });
    } catch (error) {
      logWorkshopFinalization("customer confirmation email failed", {
        bookingId: booking.id,
        recipient: customerEmail,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
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
    } else if (claimedRows && claimedRows.length > 0) {
      try {
        const stornoPolicyLabel = shouldShowWorkshopCancellationPolicy(course?.price_cents ?? null, input.paymentStatus)
          ? getWorkshopStornoPolicyLabel(course?.workshop_storno_policy)
          : null;
        const result = await sendWorkshopBookingNotificationEmail({
          bookingId: booking.id,
          workshopTitle: course?.title ?? "Angebot",
          providerType: providerContact.providerType,
          providerName: providerContact.providerName,
          teacherName: providerContact.providerContactName,
          teacherEmail: providerEmail,
          senderDisplayName:
            providerContact.providerType === "studio_provider"
              ? providerContact.providerName
              : providerContact.providerContactName,
          senderImageUrl: providerContact.senderImageUrl,
          providerLogoUrl: providerContact.providerLogoUrl,
          customerName,
          customerEmail: customerEmail ?? "",
          customerPhone: booking.customer_phone?.trim() || null,
          location: course?.location ?? null,
          locationDetails: course?.location_details ?? null,
          startsAt: firstSessionStart,
          endsAt: lastSessionEnd,
          sessionLines,
          stornoPolicyLabel,
          priceLabel: formatWorkshopPriceLabel(course?.price_cents ?? null, course?.currency ?? null, input.paymentStatus),
          paymentStatus: input.paymentStatus,
          qrToken: ticket.qr_token,
        });

        if (result?.error) {
          throw result.error;
        }

        logWorkshopFinalization("provider mail sent", {
          bookingId: booking.id,
          recipient: providerEmail,
          paymentStatus: input.paymentStatus,
        });
      } catch (error) {
        await admin
          .from("bookings")
          .update({ workshop_provider_notification_email_sent_at: null })
          .eq("id", booking.id)
          .eq("workshop_provider_notification_email_sent_at", claimedAt);

        logWorkshopFinalization("provider notification email failed", {
          bookingId: booking.id,
          recipient: providerEmail,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return {
    bookingId: booking.id,
    courseId: booking.course_id,
    status: "paid",
    attendeeKey: booking.attendee_key,
    ticket,
    workshopTitle: course?.title ?? "Angebot",
    customerName,
    customerEmail,
    location: course?.location ?? null,
    locationDetails: course?.location_details ?? null,
    sessionLines,
    providerType: providerContact.providerType,
    providerName: providerContact.providerName,
    instructorName: course?.instructor_name ?? null,
    stornoPolicyLabel: shouldShowWorkshopCancellationPolicy(course?.price_cents ?? null, input.paymentStatus)
      ? getWorkshopStornoPolicyLabel(course?.workshop_storno_policy)
      : null,
    priceLabel: formatWorkshopPriceLabel(course?.price_cents ?? null, course?.currency ?? null, input.paymentStatus),
    priceCents: course?.price_cents ?? null,
    currency: course?.currency ?? null,
    providerLogoUrl: providerContact.providerLogoUrl,
    providerPhotoUrl: providerContact.senderImageUrl,
    offerImageUrl: course?.offer_image_url ?? null,
    paymentStatus: input.paymentStatus,
  };
}

export async function finalizeWorkshopBookingBySession(
  sessionId: string
): Promise<FinalizedWorkshopBooking | null> {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["payment_intent"],
  });
  const bookingId = session.metadata?.bookingId ?? session.client_reference_id ?? null;

  if (!bookingId || session.payment_status !== "paid") {
    return null;
  }

  return finalizeWorkshopBookingRecord({
    bookingId,
    paymentProvider: "stripe",
    paymentStatus: "paid",
    paymentSessionId: session.id,
    customerEmail: session.customer_details?.email ?? session.customer_email ?? null,
    customerName: session.customer_details?.name?.trim() || null,
    stripeSession: session,
  });
}

export async function finalizeFreeWorkshopBooking(
  bookingId: string
): Promise<FinalizedWorkshopBooking | null> {
  return finalizeWorkshopBookingRecord({
    bookingId,
    paymentProvider: "free",
    paymentStatus: "free",
  });
}
