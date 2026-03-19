import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { finalizeWorkshopBookingBySession } from "@/lib/workshop-booking-finalization";
import {
  sendWorkshopTeacherBookingNotificationEmail,
} from "@/lib/workshop-booking-emails";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

type ProfileRow = {
  first_name: string | null;
  last_name: string | null;
};

function logWebhookEvent(message: string, payload: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production") return;
  console.log("[stripe-webhook]", message, payload);
}

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Signature verification failed";
    console.error("[stripe-webhook] signature verification failed", message);
    return NextResponse.json({ error: `Webhook Error: ${message}` }, { status: 400 });
  }

  try {
    if (event.type !== "checkout.session.completed") {
      return NextResponse.json({ received: true });
    }

    const session = event.data.object as Stripe.Checkout.Session;
    if (session.payment_status !== "paid") {
      return NextResponse.json({ received: true });
    }

    const admin = createSupabaseAdmin();
    const finalized = await finalizeWorkshopBookingBySession(session.id);
    if (!finalized) {
      return NextResponse.json({ received: true });
    }

    logWebhookEvent("workshop booking finalized", {
      bookingId: finalized.bookingId,
      ticketId: finalized.ticket?.id ?? null,
    });

    if (finalized.courseId && finalized.ticket) {
      const { data: course } = await admin
        .from("courses")
        .select("teacher_id")
        .eq("id", finalized.courseId)
        .maybeSingle<{ teacher_id: string | null }>();

      let teacherName: string | null = null;
      let teacherEmail: string | null = null;

      if (course?.teacher_id) {
        const [{ data: profile }, authResult] = await Promise.all([
          admin
            .from("profiles")
            .select("first_name,last_name")
            .eq("id", course.teacher_id)
            .maybeSingle<ProfileRow>(),
          admin.auth.admin.getUserById(course.teacher_id),
        ]);

        const nameParts = [profile?.first_name, profile?.last_name].filter(Boolean);
        teacherName = nameParts.length > 0 ? nameParts.join(" ") : null;
        teacherEmail = authResult.data.user?.email ?? null;
      }

      try {
        logWebhookEvent("workshop teacher email attempt", { bookingId: finalized.bookingId });
        const result = await sendWorkshopTeacherBookingNotificationEmail({
          bookingId: finalized.bookingId,
          workshopTitle: finalized.workshopTitle ?? "Workshop",
          providerName: finalized.providerName,
          teacherName,
          teacherEmail,
          customerName: finalized.customerName,
          customerEmail: finalized.customerEmail ?? "",
          location: finalized.location,
          locationDetails: finalized.locationDetails,
          sessionLines: finalized.sessionLines,
          stornoPolicyLabel: finalized.stornoPolicyLabel,
          priceLabel: finalized.priceLabel,
          qrToken: finalized.ticket.qr_token,
        });
        logWebhookEvent(result ? "workshop teacher email sent" : "workshop teacher email skipped", {
          bookingId: finalized.bookingId,
        });
      } catch (error) {
        logWebhookEvent("workshop teacher email failed", { bookingId: finalized.bookingId });
        console.error("[stripe-webhook] workshop teacher email failed", error);
      }
    }

    return NextResponse.json({ received: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Webhook handler failed";
    console.error("[stripe-webhook] handler failed", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
