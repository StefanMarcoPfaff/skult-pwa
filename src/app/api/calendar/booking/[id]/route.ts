import { NextResponse } from "next/server";
import { buildCalendarFile, type CalendarBookingSource } from "@/lib/calendar";
import {
  buildRegisteredParticipantCalendarFileInput,
  buildTrialCalendarFileInput,
  buildWorkshopBookingCalendarFileInput,
  type OfferCalendarCourseRow,
  type OfferCalendarSessionRow,
} from "@/lib/calendar-resolver";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type TicketRow = {
  id: string;
  booking_id: string | null;
  trial_reservation_id: string | null;
  subscription_id: string | null;
  course_id: string | null;
  type: "workshop" | "trial" | "course_session" | "course_participant";
};

type TrialReservationRow = {
  id: string;
  course_id: string;
  trial_starts_at: string | null;
  trial_ends_at: string | null;
};

type RegistrationIntentRow = {
  id: string;
  trial_reservation_id: string;
  course_id: string;
  stripe_subscription_id: string | null;
  status: string | null;
};

type BookingRow = {
  id: string;
  course_id: string | null;
};

function isCalendarSource(value: string | null): value is CalendarBookingSource {
  return value === "ticket" || value === "trial" || value === "registered" || value === "workshop";
}

async function loadOwnedCourse(
  admin: ReturnType<typeof createSupabaseAdmin>,
  courseId: string,
  teacherId: string
) {
  return admin
    .from("courses")
    .select(
      "id,title,kind,location,location_details,starts_at,duration_minutes,weekday,start_time,recurrence_type"
    )
    .eq("id", courseId)
    .eq("teacher_id", teacherId)
    .maybeSingle<OfferCalendarCourseRow>();
}

async function loadCourseSessions(admin: ReturnType<typeof createSupabaseAdmin>, courseId: string) {
  return admin
    .from("course_sessions")
    .select("id,starts_at,ends_at")
    .eq("course_id", courseId)
    .order("starts_at", { ascending: true })
    .returns<OfferCalendarSessionRow[]>();
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const url = new URL(request.url);
  const source = url.searchParams.get("source");

  if (!isCalendarSource(source)) {
    return NextResponse.json({ error: "invalid_source" }, { status: 400 });
  }

  const admin = createSupabaseAdmin();

  if (source === "ticket") {
    const { data: ticket } = await admin
      .from("tickets")
      .select("id,booking_id,trial_reservation_id,subscription_id,course_id,type")
      .eq("qr_token", id)
      .maybeSingle<TicketRow>();

    if (!ticket?.course_id) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const [{ data: course }, { data: sessions }] = await Promise.all([
      admin
        .from("courses")
        .select(
          "id,title,kind,location,location_details,starts_at,duration_minutes,weekday,start_time,recurrence_type"
        )
        .eq("id", ticket.course_id)
        .maybeSingle<OfferCalendarCourseRow>(),
      loadCourseSessions(admin, ticket.course_id),
    ]);

    if (!course) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const calendarInput =
      ticket.type === "trial" && ticket.trial_reservation_id
        ? await (async () => {
            const { data: reservation } = await admin
              .from("trial_reservations")
              .select("id,course_id,trial_starts_at,trial_ends_at")
              .eq("id", ticket.trial_reservation_id)
              .maybeSingle<TrialReservationRow>();

            if (!reservation) return null;
            return buildTrialCalendarFileInput({
              reservationId: reservation.id,
              courseId: reservation.course_id,
              courseTitle: course.title,
              location: course.location,
              locationDetails: course.location_details,
              startsAt: reservation.trial_starts_at,
              endsAt: reservation.trial_ends_at,
            });
          })()
        : ticket.type === "course_participant"
          ? buildRegisteredParticipantCalendarFileInput(course)
          : buildWorkshopBookingCalendarFileInput(course, sessions ?? []);

    if (!calendarInput) {
      return NextResponse.json({ error: "calendar_unavailable" }, { status: 409 });
    }

    const { filename, content } = buildCalendarFile(calendarInput);
    return new NextResponse(content, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, max-age=0, must-revalidate",
      },
    });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (source === "trial") {
    const { data: reservation } = await admin
      .from("trial_reservations")
      .select("id,course_id,trial_starts_at,trial_ends_at")
      .eq("id", id)
      .maybeSingle<TrialReservationRow>();

    if (!reservation) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const { data: course } = await loadOwnedCourse(admin, reservation.course_id, user.id);
    if (!course) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const calendarInput = buildTrialCalendarFileInput({
      reservationId: reservation.id,
      courseId: reservation.course_id,
      courseTitle: course.title,
      location: course.location,
      locationDetails: course.location_details,
      startsAt: reservation.trial_starts_at,
      endsAt: reservation.trial_ends_at,
    });

    if (!calendarInput) {
      return NextResponse.json({ error: "calendar_unavailable" }, { status: 409 });
    }

    const { filename, content } = buildCalendarFile(calendarInput);
    return new NextResponse(content, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, max-age=0, must-revalidate",
      },
    });
  }

  if (source === "registered") {
    const { data: intent } = await admin
      .from("course_registration_intents")
      .select("id,trial_reservation_id,course_id,stripe_subscription_id,status")
      .eq("trial_reservation_id", id)
      .eq("status", "checkout_completed")
      .maybeSingle<RegistrationIntentRow>();

    if (!intent) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const { data: course } = await loadOwnedCourse(admin, intent.course_id, user.id);
    if (!course) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const calendarInput = buildRegisteredParticipantCalendarFileInput(course);
    if (!calendarInput) {
      return NextResponse.json({ error: "calendar_unavailable" }, { status: 409 });
    }

    const { filename, content } = buildCalendarFile(calendarInput);
    return new NextResponse(content, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, max-age=0, must-revalidate",
      },
    });
  }

  const { data: booking } = await admin
    .from("bookings")
    .select("id,course_id")
    .eq("id", id)
    .maybeSingle<BookingRow>();

  if (!booking?.course_id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const [{ data: course }, { data: sessions }] = await Promise.all([
    loadOwnedCourse(admin, booking.course_id, user.id),
    loadCourseSessions(admin, booking.course_id),
  ]);

  if (!course) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const calendarInput = buildWorkshopBookingCalendarFileInput(course, sessions ?? []);
  if (!calendarInput) {
    return NextResponse.json({ error: "calendar_unavailable" }, { status: 409 });
  }

  const { filename, content } = buildCalendarFile(calendarInput);
  return new NextResponse(content, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, max-age=0, must-revalidate",
    },
  });
}
