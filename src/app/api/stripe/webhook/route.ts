import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createTicketRecord } from "@/lib/tickets";
import {
  sendWorkshopCustomerBookingConfirmationEmail,
  sendWorkshopTeacherBookingNotificationEmail,
} from "@/lib/workshop-booking-emails";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

type BookingRow = {
  id: string;
  status: string | null;
  course_id: string | null;
};

type CourseRow = {
  id: string;
  title: string | null;
  location: string | null;
  teacher_id: string | null;
  starts_at: string | null;
};

type SessionRow = {
  starts_at: string | null;
  ends_at: string | null;
};

type ProfileRow = {
  first_name: string | null;
  last_name: string | null;
};

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

    const bookingId = session.metadata?.bookingId || session.client_reference_id;
    const courseId = session.metadata?.courseId ?? null;
    const customerEmail = session.customer_details?.email ?? session.customer_email ?? null;
    const customerName = session.customer_details?.name?.trim() || "Workshop-Gast";

    if (!bookingId) {
      return NextResponse.json({ error: "No bookingId found" }, { status: 400 });
    }

    if (!customerEmail) {
      return NextResponse.json({ error: "No customer email found" }, { status: 400 });
    }

    const admin = createSupabaseAdmin();
    const { data: booking, error: bookingError } = await admin
      .from("bookings")
      .select("id,status,course_id")
      .eq("id", bookingId)
      .maybeSingle<BookingRow>();

    if (bookingError || !booking) {
      console.error("[stripe-webhook] booking load failed", bookingError);
      return NextResponse.json({ error: "Booking load failed" }, { status: 500 });
    }

    const { error: bookingUpdateError } = await admin
      .from("bookings")
      .update({ status: "paid" })
      .eq("id", bookingId)
      .neq("status", "paid");

    if (bookingUpdateError) {
      console.error("[stripe-webhook] booking update failed", bookingUpdateError);
      return NextResponse.json({ error: "Booking update failed" }, { status: 500 });
    }

    const { ticket, created } = await createTicketRecord({
      type: "workshop",
      bookingId,
      courseId: courseId ?? booking.course_id,
      customerName,
      customerEmail,
    });

    if (created) {
      const resolvedCourseId = courseId ?? booking.course_id;

      if (resolvedCourseId) {
        const [{ data: course }, { data: firstSession }] = await Promise.all([
          admin
            .from("courses")
            .select("id,title,location,teacher_id,starts_at")
            .eq("id", resolvedCourseId)
            .maybeSingle<CourseRow>(),
          admin
            .from("course_sessions")
            .select("starts_at,ends_at")
            .eq("course_id", resolvedCourseId)
            .order("starts_at", { ascending: true })
            .limit(1)
            .maybeSingle<SessionRow>(),
        ]);

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

        const emailData = {
          bookingId,
          workshopTitle: course?.title ?? "Workshop",
          teacherName,
          teacherEmail,
          customerName,
          customerEmail,
          location: course?.location ?? null,
          startsAt: firstSession?.starts_at ?? course?.starts_at ?? null,
          endsAt: firstSession?.ends_at ?? null,
          qrToken: ticket.qr_token,
        };

        try {
          await sendWorkshopCustomerBookingConfirmationEmail(emailData);
        } catch (error) {
          console.error("[stripe-webhook] workshop customer email failed", error);
        }

        try {
          await sendWorkshopTeacherBookingNotificationEmail(emailData);
        } catch (error) {
          console.error("[stripe-webhook] workshop teacher email failed", error);
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Webhook handler failed";
    console.error("[stripe-webhook] handler failed", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
