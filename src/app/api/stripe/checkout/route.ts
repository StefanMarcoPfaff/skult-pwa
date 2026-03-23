import { NextResponse } from "next/server";
import { buildOfferAvailability, loadOccupiedWorkshopSeats } from "@/lib/public-offer-availability";
import { getStripe } from "@/lib/stripe";
import {
  buildDestinationPaymentIntentData,
  getSiteUrl,
  isStripeDestinationChargeReady,
  summarizeStripeAccount,
} from "@/lib/stripe-connect";
import { createClient } from "@/lib/supabase-server";
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
    const customerEmail = requiredText(email).toLowerCase();
    const customerPhone = requiredText(phone);

    if (!customerFirstName || !customerLastName || !customerEmail || !customerPhone) {
      return NextResponse.json({ error: "Bitte fülle alle Pflichtfelder aus." }, { status: 400 });
    }

    if (!agbAccepted || !privacyAccepted || !workshopStornoAccepted) {
      return NextResponse.json(
        { error: "Bitte bestätige AGB, Datenschutz und die Workshop-Stornoregelung." },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const { data: course, error: courseErr } = await supabase
      .from("courses_lite")
      .select("id,title,price_type,price_cents,currency,offer_type,capacity")
      .eq("id", courseId)
      .single();

    if (courseErr || !course) {
      return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
    }

    if (course.offer_type !== "workshop") {
      return NextResponse.json({ error: "Checkout nur für Workshops (V1)" }, { status: 400 });
    }

    if (course.price_type !== "paid" || !course.price_cents || course.price_cents <= 0) {
      return NextResponse.json({ error: "Workshop nicht paid konfiguriert" }, { status: 400 });
    }

    const capacity =
      typeof course.capacity === "number"
        ? course.capacity
        : typeof course.capacity === "string" && course.capacity.trim()
          ? Number(course.capacity)
          : null;
    const availability = buildOfferAvailability(
      Number.isFinite(capacity) ? capacity : null,
      await loadOccupiedWorkshopSeats(courseId)
    );
    if (availability.isSoldOut) {
      return NextResponse.json({ error: "Dieser Workshop ist aktuell ausgebucht." }, { status: 400 });
    }

    const { data: ownerCourse, error: ownerCourseError } = await supabase
      .from("courses")
      .select("id,teacher_id")
      .eq("id", course.id)
      .eq("is_published", true)
      .maybeSingle<{ id: string; teacher_id: string | null }>();

    if (ownerCourseError || !ownerCourse?.teacher_id) {
      return NextResponse.json(
        { error: "Der Dozent hat noch keine Zahlungsdaten hinterlegt." },
        { status: 400 }
      );
    }

    const { data: teacherProfile, error: teacherProfileError } = await supabase
      .from("profiles")
      .select("stripe_account_id")
      .eq("id", ownerCourse.teacher_id)
      .maybeSingle<{ stripe_account_id: string | null }>();

    if (teacherProfileError || !teacherProfile?.stripe_account_id) {
      return NextResponse.json(
        { error: "Der Dozent hat noch keine Zahlungsdaten hinterlegt." },
        { status: 400 }
      );
    }

    const stripe = getStripe();
    const connectedAccount = await stripe.accounts.retrieve(teacherProfile.stripe_account_id);

    logCheckoutConnectState("account.retrieve", {
      stripeAccountId: teacherProfile.stripe_account_id,
      account: summarizeStripeAccount(connectedAccount),
    });

    if (!isStripeDestinationChargeReady(connectedAccount)) {
      return NextResponse.json(
        {
          error:
            "Das verbundene Stripe-Konto des Dozenten ist noch nicht für Destination Charges mit card_payments und transfers freigeschaltet.",
        },
        { status: 400 }
      );
    }

    const attendeeKey = makeAttendeeKey();

    const acceptedAt = new Date().toISOString();

    const { data: booking, error: bookingErr } = await supabase
      .from("bookings")
      .insert({
        course_id: course.id,
        attendee_key: attendeeKey,
        status: "pending",
        payment_provider: "stripe",
        customer_first_name: customerFirstName,
        customer_last_name: customerLastName,
        customer_email: customerEmail,
        customer_phone: customerPhone,
        agb_accepted_at: acceptedAt,
        privacy_accepted_at: acceptedAt,
        workshop_storno_terms_accepted_at: acceptedAt,
      })
      .select("id, attendee_key")
      .single();

    if (bookingErr || !booking) {
      return NextResponse.json(
        { error: bookingErr?.message || "Booking konnte nicht erstellt werden" },
        { status: 500 }
      );
    }

    const siteUrl = getSiteUrl(req.url);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card", "sepa_debit"],
      customer_email: customerEmail,
      line_items: [
        {
          price_data: {
            currency: (course.currency || "EUR").toLowerCase(),
            unit_amount: course.price_cents,
            product_data: { name: course.title || "Workshop" },
          },
          quantity: 1,
        },
      ],
      success_url: `${siteUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}&courseId=${course.id}`,
      cancel_url: `${siteUrl}/checkout/cancel?courseId=${course.id}`,
      payment_intent_data: {
        ...buildDestinationPaymentIntentData(course.price_cents, teacherProfile.stripe_account_id),
        on_behalf_of: teacherProfile.stripe_account_id,
      },
      metadata: {
        bookingId: booking.id,
        courseId: course.id,
        attendeeKey: booking.attendee_key,
        teacherStripeAccountId: teacherProfile.stripe_account_id,
        customerFirstName,
        customerLastName,
        customerEmail,
        customerPhone,
      },
      client_reference_id: booking.id,
    });

    const { error: updErr } = await supabase
      .from("bookings")
      .update({
        stripe_session_id: session.id,
        payment_session_id: session.id,
        payment_provider: "stripe",
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
