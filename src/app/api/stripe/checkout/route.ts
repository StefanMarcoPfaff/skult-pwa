import { NextResponse } from "next/server";
import type Stripe from "stripe";
import {
  ACTIVE_BOOKING_DUPLICATE_MESSAGE,
  hasActiveWorkshopBookingForEmail,
  isActiveBookingDuplicateError,
  normalizeBookingEmail,
} from "@/lib/booking-duplicate-guard";
import { buildOfferAvailability, loadOccupiedWorkshopSeats } from "@/lib/public-offer-availability";
import { isPaymentsV2StripePlatformChargesEnabled } from "@/lib/payments/config";
import { paymentService } from "@/lib/payments/payment-service";
import { isDirectlyAccessibleOffer } from "@/lib/public-offer-visibility";
import { getStripe } from "@/lib/stripe";
import {
  getSiteUrl,
  isStripeDestinationChargeReady,
  summarizeStripeAccount,
} from "@/lib/stripe-connect";
import type { ProviderType } from "@/lib/provider-profiles";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getWorkshopCheckoutCurrencyError,
  isWorkshopCheckoutCurrencySupported,
  normalizeWorkshopCurrency,
} from "@/lib/workshop-checkout";
import { finalizeFreeWorkshopBooking } from "@/lib/workshop-booking-finalization";
import { getWorkshopCancellationPolicyValue } from "@/lib/offer-policies";
import { shouldShowWorkshopCancellationPolicy } from "@/lib/workshop-offer-display";
import crypto from "crypto";

export const runtime = "nodejs";

function makeAttendeeKey() {
  return crypto.randomBytes(16).toString("hex");
}

function logCheckoutConnectState(context: string, payload: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production") return;
  console.log("[stripe-checkout-connect]", {
    context,
    ...payload,
  });
}

function requiredText(value: unknown): string {
  return String(value ?? "").trim();
}

function isWorkshopBookable(startsAt: string | null, endsAt: string | null) {
  const reference = endsAt ?? startsAt;
  if (!reference) return true;
  const parsed = new Date(reference).getTime();
  return Number.isFinite(parsed) ? parsed >= Date.now() : true;
}

export async function POST(req: Request) {
  try {
    const {
      courseId,
      firstName,
      lastName,
      email,
      phone,
      agbAccepted,
      privacyAccepted,
      workshopStornoAccepted,
    } = (await req.json()) as {
      courseId?: string;
      firstName?: string;
      lastName?: string;
      email?: string;
      phone?: string;
      agbAccepted?: boolean;
      privacyAccepted?: boolean;
      workshopStornoAccepted?: boolean;
    };

    if (!courseId) {
      return NextResponse.json({ error: "courseId fehlt" }, { status: 400 });
    }

    const customerFirstName = requiredText(firstName);
    const customerLastName = requiredText(lastName);
    const customerEmail = normalizeBookingEmail(requiredText(email));
    const customerPhone = requiredText(phone);

    if (!customerFirstName || !customerLastName || !customerEmail || !customerPhone) {
      return NextResponse.json({ error: "Bitte fülle alle Pflichtfelder aus." }, { status: 400 });
    }

    if (!agbAccepted || !privacyAccepted) {
      return NextResponse.json(
        { error: "Bitte bestätige AGB und Datenschutz." },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAdmin();
    const { data: course, error: courseErr } = await supabase
      .from("courses")
      .select("id,title,teacher_id,kind,price_cents,currency,capacity,starts_at,ends_at,is_published,status,visibility,workshop_storno_policy")
      .eq("id", courseId)
      .maybeSingle<{
        id: string;
        title: string | null;
        teacher_id: string | null;
        kind: string | null;
        price_cents: number | null;
        currency: string | null;
        capacity: number | null;
        starts_at: string | null;
        ends_at: string | null;
        is_published: boolean | null;
        status: string | null;
        visibility: string | null;
        workshop_storno_policy: string | null;
      }>();

    if (courseErr || !course) {
      return NextResponse.json({ error: "Angebot nicht gefunden." }, { status: 404 });
    }

    if (course.kind !== "workshop" && course.kind !== "exclusive_offer") {
      return NextResponse.json({ error: "Checkout nur für einmalige Angebote" }, { status: 400 });
    }

    const requiresWorkshopStornoConsent =
      shouldShowWorkshopCancellationPolicy(course.price_cents) &&
      Boolean(getWorkshopCancellationPolicyValue({ workshop_storno_policy: course.workshop_storno_policy }));

    if (requiresWorkshopStornoConsent && !workshopStornoAccepted) {
      return NextResponse.json(
        { error: "Bitte bestätige die Stornierungsbedingungen." },
        { status: 400 }
      );
    }

    if (
      !isDirectlyAccessibleOffer({
        kind: course.kind,
        status: course.status,
        isPublished: course.is_published ?? false,
        visibility: course.visibility,
        startsAt: course.starts_at,
        endsAt: course.ends_at,
      })
    ) {
      return NextResponse.json({ error: "Dieses Angebot ist nicht buchbar." }, { status: 400 });
    }

    const normalizedPriceCents = typeof course.price_cents === "number" ? course.price_cents : 0;
    const isFreeOffer = normalizedPriceCents <= 0;

    const capacity = typeof course.capacity === "number" ? course.capacity : null;
    const workshopCanBook = isWorkshopBookable(course.starts_at, course.ends_at);
    const availability = buildOfferAvailability(
      Number.isFinite(capacity) ? capacity : null,
      await loadOccupiedWorkshopSeats(courseId),
      {
        isBookable: workshopCanBook,
      }
    );
    if (!workshopCanBook) {
      return NextResponse.json({ error: "Dieses Angebot ist nicht mehr buchbar." }, { status: 400 });
    }
    if (availability.isSoldOut) {
      return NextResponse.json({ error: "Dieses Angebot ist aktuell ausgebucht." }, { status: 400 });
    }

    const hasDuplicateBooking = await hasActiveWorkshopBookingForEmail({
      admin: supabase,
      courseId: course.id,
      email: customerEmail,
    });

    if (hasDuplicateBooking) {
      return NextResponse.json({ error: ACTIVE_BOOKING_DUPLICATE_MESSAGE }, { status: 409 });
    }

    const attendeeKey = makeAttendeeKey();
    const acceptedAt = new Date().toISOString();

    const { data: booking, error: bookingErr } = await supabase
      .from("bookings")
      .insert({
        course_id: course.id,
        attendee_key: attendeeKey,
        status: "pending",
        payment_provider: isFreeOffer ? "free" : "stripe",
        payment_status: "pending",
        customer_first_name: customerFirstName,
        customer_last_name: customerLastName,
        customer_email: customerEmail,
        customer_phone: customerPhone,
        agb_accepted_at: acceptedAt,
        privacy_accepted_at: acceptedAt,
        workshop_storno_terms_accepted_at: acceptedAt,
      })
      .select("id,attendee_key")
      .single();

    if (bookingErr || !booking) {
      if (bookingErr && isActiveBookingDuplicateError(bookingErr)) {
        return NextResponse.json({ error: ACTIVE_BOOKING_DUPLICATE_MESSAGE }, { status: 409 });
      }
      return NextResponse.json(
        { error: bookingErr?.message || "Reservierung konnte nicht erstellt werden." },
        { status: 500 }
      );
    }

    if (isFreeOffer) {
      logCheckoutConnectState("free booking created", {
        bookingId: booking.id,
        courseId: course.id,
        paymentProvider: "free",
        stripeCheckoutSkipped: true,
      });
    }

    const siteUrl = getSiteUrl(req.url);
    const usePlatformCharge = isPaymentsV2StripePlatformChargesEnabled();

    if (isFreeOffer) {
      let finalized: Awaited<ReturnType<typeof finalizeFreeWorkshopBooking>> = null;
      try {
        finalized = await finalizeFreeWorkshopBooking(booking.id);
      } catch (error) {
        console.error("[free-workshop-booking]", {
          context: "finalize.failed",
          bookingId: booking.id,
          courseId: course.id,
          message: error instanceof Error ? error.message : String(error),
        });
      }
      if (!finalized?.ticket) {
        return NextResponse.json(
          { error: "Ticket konnte nicht erstellt werden oder die Reservierung konnte nicht bestätigt werden." },
          { status: 500 }
        );
      }

      logCheckoutConnectState("free booking finalized", {
        bookingId: booking.id,
        courseId: course.id,
        ticketCreated: Boolean(finalized.ticket),
        customerEmail: finalized.customerEmail,
        paymentStatus: finalized.paymentStatus,
      });

      return NextResponse.json({
        url: `${siteUrl}/checkout/success?booking_id=${booking.id}`,
      });
    }

    if (!isWorkshopCheckoutCurrencySupported(course.currency)) {
      return NextResponse.json(
        { error: getWorkshopCheckoutCurrencyError(course.currency) },
        { status: 400 }
      );
    }

    if (!course.teacher_id) {
      return NextResponse.json(
        { error: "Die Anbietenden haben noch keine Zahlungsdaten hinterlegt." },
        { status: 400 }
      );
    }

    const { data: teacherProfile, error: teacherProfileError } = await supabase
      .from("profiles")
      .select("stripe_account_id,provider_type")
      .eq("id", course.teacher_id)
      .maybeSingle<{ stripe_account_id: string | null; provider_type: ProviderType | null }>();

    if (teacherProfileError || !teacherProfile) {
      return NextResponse.json(
        { error: "Die Anbietenden haben noch keine Zahlungsdaten hinterlegt." },
        { status: 400 }
      );
    }

    if (!usePlatformCharge && !teacherProfile.stripe_account_id) {
      return NextResponse.json(
        { error: "Die Anbietenden haben noch keine Zahlungsdaten hinterlegt." },
        { status: 400 }
      );
    }

    if (!usePlatformCharge) {
      const stripe = getStripe();
      let connectedAccount: Stripe.Account;
      try {
        connectedAccount = await stripe.accounts.retrieve(teacherProfile.stripe_account_id!);
      } catch (error: unknown) {
        console.error("[stripe-checkout-connect]", {
          context: "account.retrieve.failed",
          stripeAccountId: teacherProfile.stripe_account_id,
          message: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json(
          {
            error:
              "Die hinterlegten Stripe-Zahlungsdaten der Anbietenden sind nicht mehr gültig. Bitte Stripe-Onboarding erneut starten.",
          },
          { status: 400 }
        );
      }

      logCheckoutConnectState("account.retrieve", {
        stripeAccountId: teacherProfile.stripe_account_id,
        account: summarizeStripeAccount(connectedAccount),
      });

      if (!isStripeDestinationChargeReady(connectedAccount)) {
        return NextResponse.json(
          {
            error:
              "Das verbundene Stripe-Konto der Anbietenden ist noch nicht für Destination Charges mit card_payments und transfers freigeschaltet.",
          },
          { status: 400 }
        );
      }
    }

    const workshopCurrency = normalizeWorkshopCurrency(course.currency);
    const session = await paymentService.createCheckoutSession({
      provider: "stripe",
      mode: "payment",
      customer: {
        email: customerEmail,
      },
      lineItems: [
        {
          quantity: 1,
          priceData: {
            currency: workshopCurrency,
            unitAmount: normalizedPriceCents,
            productName: course.title || "Angebot",
          },
        },
      ],
      successUrl: `${siteUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}&courseId=${course.id}`,
      cancelUrl: `${siteUrl}/checkout/cancel?courseId=${course.id}`,
      providerContext: usePlatformCharge
        ? undefined
        : {
            connectedAccountId: teacherProfile.stripe_account_id,
            onBehalfOfAccountId: teacherProfile.stripe_account_id,
            providerType: teacherProfile.provider_type,
          },
      metadata: {
        payment_model: usePlatformCharge ? "platform_charge" : "connect_destination_charge",
        ledger_mode: usePlatformCharge ? "reser_managed_split" : "stripe_connect_destination_split",
        provider_id: course.teacher_id,
        booking_id: booking.id,
        bookingId: booking.id,
        courseId: course.id,
        course_id: course.id,
        attendeeKey: booking.attendee_key,
        ...(teacherProfile.stripe_account_id ? { teacherStripeAccountId: teacherProfile.stripe_account_id } : {}),
        customerFirstName,
        customerLastName,
        customerEmail,
        customerPhone,
      },
      clientReferenceId: booking.id,
    });

    const { error: updErr } = await supabase
      .from("bookings")
      .update({
        stripe_session_id: session.sessionId,
        payment_session_id: session.sessionId,
        payment_provider: "stripe",
        payment_status: "pending",
      })
      .eq("id", booking.id);

    if (updErr) {
      console.warn("Could not store stripe_session_id:", updErr.message);
    }

    return NextResponse.json({ url: session.url });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Serverfehler";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
