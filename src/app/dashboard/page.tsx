import Link from "next/link";
import { redirect } from "next/navigation";
import { calculateCoursePriceBreakdown } from "@/lib/course-pricing";
import { PROVIDER_PAYOUT_PROFILE_PROVIDER } from "@/lib/payout-profile";
import type { ProviderType } from "@/lib/provider-profiles";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DashboardNavCard } from "./DashboardNavCard";
import LogoutButton from "./logout-button";

type CourseRow = {
  id: string;
  title: string;
  kind: string | null;
  status: string | null;
  is_published: boolean | null;
  starts_at: string | null;
  ends_at: string | null;
  instructor_name: string | null;
  location: string | null;
  price_cents: number | null;
  currency: string | null;
};

type SessionRow = {
  id: string;
  course_id: string;
  starts_at: string | null;
  ends_at: string | null;
};

type ProfileRow = {
  first_name: string | null;
  last_name: string | null;
  bio: string | null;
  stripe_account_id: string | null;
  provider_type: ProviderType | null;
  organization_name: string | null;
};

type ProviderPayoutProfileRow = {
  payout_method: string | null;
  verification_status: string | null;
};

type TrialReservationRow = {
  id: string;
  course_id: string;
  trial_starts_at: string | null;
  trial_ends_at: string | null;
  decision_status: string | null;
  cancelled_at: string | null;
};

type RegistrationIntentRow = {
  id: string;
  course_id: string;
  trial_reservation_id: string;
  status: string | null;
  completed_at: string | null;
  stripe_subscription_id: string | null;
  subscription_status: string | null;
};

type BookingRow = {
  id: string;
  course_id: string | null;
  status: string | null;
  created_at: string | null;
  checked_in_at: string | null;
  refunded_at: string | null;
  stripe_refund_id: string | null;
};

type TicketRow = {
  id: string;
  booking_id: string | null;
  trial_reservation_id: string | null;
  subscription_id: string | null;
  checked_in_at: string | null;
};

type AttendanceRow = {
  course_id: string;
  session_id: string | null;
  event_date: string | null;
  ticket_id: string;
  checked_in_at: string;
};

type EventContext = {
  sessionId: string | null;
  eventDate: string;
  isUpcomingOrCurrent: boolean;
};

function formatCurrency(valueCents: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(valueCents / 100);
}

function normalizeEventDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 10) : null;
}

function createAttendanceKey(courseId: string, sessionId: string | null, eventDate: string, ticketId: string) {
  return `${courseId}::${sessionId ?? "none"}::${eventDate}::${ticketId}`;
}

function getUpcomingCourseEvent(course: CourseRow, sessions: SessionRow[]): EventContext | null {
  const now = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  const sortedSessions = [...sessions].sort((left, right) =>
    String(left.starts_at ?? "").localeCompare(String(right.starts_at ?? ""))
  );

  for (const session of sortedSessions) {
    const eventDate = normalizeEventDate(session.starts_at);
    if (!eventDate) continue;

    const startTime = session.starts_at ? new Date(session.starts_at).getTime() : Number.NaN;
    const endTime = session.ends_at ? new Date(session.ends_at).getTime() : Number.NaN;
    if ((Number.isFinite(endTime) && endTime >= now) || (Number.isFinite(startTime) && startTime >= now)) {
      return { sessionId: session.id, eventDate, isUpcomingOrCurrent: true };
    }
  }

  const fallbackDate = normalizeEventDate(course.starts_at);
  if (!fallbackDate) return null;
  const fallbackTime = course.ends_at ?? course.starts_at;
  const fallbackTimestamp = fallbackTime ? new Date(fallbackTime).getTime() : Number.NaN;
  return {
    sessionId: null,
    eventDate: fallbackDate,
    isUpcomingOrCurrent: (Number.isFinite(fallbackTimestamp) && fallbackTimestamp >= now) || fallbackDate >= today,
  };
}

function getTrialEvent(reservation: TrialReservationRow, sessions: SessionRow[]): EventContext | null {
  const now = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  const eventDate = normalizeEventDate(reservation.trial_starts_at);
  if (!eventDate) return null;

  const exactSession = sessions.find((session) => session.starts_at === reservation.trial_starts_at);
  if (exactSession) {
    const endTime = exactSession.ends_at ? new Date(exactSession.ends_at).getTime() : Number.NaN;
    const startTime = exactSession.starts_at ? new Date(exactSession.starts_at).getTime() : Number.NaN;
    return {
      sessionId: exactSession.id,
      eventDate,
      isUpcomingOrCurrent: (Number.isFinite(endTime) && endTime >= now) || (Number.isFinite(startTime) && startTime >= now),
    };
  }

  const sameDaySession = sessions.find((session) => normalizeEventDate(session.starts_at) === eventDate);
  if (sameDaySession) {
    const endTime = sameDaySession.ends_at ? new Date(sameDaySession.ends_at).getTime() : Number.NaN;
    const startTime = sameDaySession.starts_at ? new Date(sameDaySession.starts_at).getTime() : Number.NaN;
    return {
      sessionId: sameDaySession.id,
      eventDate,
      isUpcomingOrCurrent: (Number.isFinite(endTime) && endTime >= now) || (Number.isFinite(startTime) && startTime >= now),
    };
  }

  const fallbackTime = reservation.trial_ends_at ?? reservation.trial_starts_at;
  const fallbackTimestamp = fallbackTime ? new Date(fallbackTime).getTime() : Number.NaN;
  return {
    sessionId: null,
    eventDate,
    isUpcomingOrCurrent: (Number.isFinite(fallbackTimestamp) && fallbackTimestamp >= now) || eventDate >= today,
  };
}

function isProfileComplete(profile: ProfileRow | null) {
  if (!profile) return false;
  const hasBase = Boolean(profile.first_name && profile.last_name && profile.bio && profile.stripe_account_id);
  if (!hasBase) return false;
  if (profile.provider_type === "studio_provider") {
    return Boolean(profile.organization_name);
  }
  return true;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const profileSavedParam = Array.isArray(sp.profileSaved) ? sp.profileSaved[0] : sp.profileSaved;
  const profileSaved = profileSavedParam === "1";

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const admin = createSupabaseAdmin();
  const [{ data: profile }, { data: courses }, { data: payoutProfile }] = await Promise.all([
    admin
      .from("profiles")
      .select("first_name,last_name,bio,stripe_account_id,provider_type,organization_name")
      .eq("id", user.id)
      .maybeSingle<ProfileRow>(),
    admin
      .from("courses")
      .select("id,title,kind,status,is_published,starts_at,ends_at,instructor_name,location,price_cents,currency")
      .eq("teacher_id", user.id)
      .returns<CourseRow[]>(),
    admin
      .from("provider_payout_profiles")
      .select("payout_method,verification_status")
      .eq("teacher_id", user.id)
      .eq("provider", PROVIDER_PAYOUT_PROFILE_PROVIDER)
      .maybeSingle<ProviderPayoutProfileRow>(),
  ]);

  const offerRows = courses ?? [];
  const courseIds = offerRows.map((course) => course.id);
  const publishedOffersCount = offerRows.filter((course) => course.is_published).length;
  const profileComplete = isProfileComplete(profile ?? null);
  const providerType = profile?.provider_type ?? null;
  const payoutProfileStatus = payoutProfile?.verification_status ?? "offen";
  const payoutProfileValue =
    payoutProfile?.payout_method === "paypal"
      ? `PayPal - ${payoutProfileStatus}`
      : payoutProfile?.payout_method === "iban"
        ? `IBAN - ${payoutProfileStatus}`
        : "Nicht hinterlegt";

  const [sessionsResult, reservationsResult, intentsResult, bookingsResult] = courseIds.length
    ? await Promise.all([
        admin
          .from("course_sessions")
          .select("id,course_id,starts_at,ends_at")
          .in("course_id", courseIds)
          .returns<SessionRow[]>(),
        admin
          .from("trial_reservations")
          .select("id,course_id,trial_starts_at,trial_ends_at,decision_status,cancelled_at")
          .in("course_id", courseIds)
          .returns<TrialReservationRow[]>(),
        admin
          .from("course_registration_intents")
          .select("id,course_id,trial_reservation_id,status,completed_at,stripe_subscription_id,subscription_status")
          .in("course_id", courseIds)
          .returns<RegistrationIntentRow[]>(),
        admin
          .from("bookings")
          .select("id,course_id,status,created_at,checked_in_at,refunded_at,stripe_refund_id")
          .in("course_id", courseIds)
          .returns<BookingRow[]>(),
      ])
    : [
        { data: [] as SessionRow[] },
        { data: [] as TrialReservationRow[] },
        { data: [] as RegistrationIntentRow[] },
        { data: [] as BookingRow[] },
      ];

  const sessions = sessionsResult.data ?? [];
  const reservations = reservationsResult.data ?? [];
  const intents = intentsResult.data ?? [];
  const bookings = bookingsResult.data ?? [];

  const trialReservationIds = reservations.map((reservation) => reservation.id);
  const subscriptionIds = intents
    .filter((intent) => intent.status === "checkout_completed" && intent.stripe_subscription_id)
    .map((intent) => intent.stripe_subscription_id as string);
  const bookingIds = bookings.map((booking) => booking.id);

  const [trialTicketsResult, subscriptionTicketsResult, workshopTicketsResult] =
    trialReservationIds.length > 0 || subscriptionIds.length > 0 || bookingIds.length > 0
      ? await Promise.all([
          trialReservationIds.length > 0
            ? admin
                .from("tickets")
                .select("id,booking_id,trial_reservation_id,subscription_id,checked_in_at")
                .in("trial_reservation_id", trialReservationIds)
                .returns<TicketRow[]>()
            : Promise.resolve({ data: [] as TicketRow[] }),
          subscriptionIds.length > 0
            ? admin
                .from("tickets")
                .select("id,booking_id,trial_reservation_id,subscription_id,checked_in_at")
                .in("subscription_id", subscriptionIds)
                .returns<TicketRow[]>()
            : Promise.resolve({ data: [] as TicketRow[] }),
          bookingIds.length > 0
            ? admin
                .from("tickets")
                .select("id,booking_id,trial_reservation_id,subscription_id,checked_in_at")
                .in("booking_id", bookingIds)
                .returns<TicketRow[]>()
            : Promise.resolve({ data: [] as TicketRow[] }),
        ])
      : [
          { data: [] as TicketRow[] },
          { data: [] as TicketRow[] },
          { data: [] as TicketRow[] },
        ];

  const allTicketRows = [
    ...(trialTicketsResult.data ?? []),
    ...(subscriptionTicketsResult.data ?? []),
    ...(workshopTicketsResult.data ?? []),
  ];
  const ticketIds = allTicketRows.map((ticket) => ticket.id);

  const { data: attendanceRows } =
    ticketIds.length > 0
      ? await admin
          .from("attendance_records")
          .select("course_id,session_id,event_date,ticket_id,checked_in_at")
          .in("course_id", courseIds)
          .in("ticket_id", ticketIds)
          .returns<AttendanceRow[]>()
      : { data: [] as AttendanceRow[] };

  const courseById = new Map(offerRows.map((course) => [course.id, course]));
  const sessionsByCourseId = new Map<string, SessionRow[]>();
  for (const session of sessions) {
    const existing = sessionsByCourseId.get(session.course_id) ?? [];
    existing.push(session);
    sessionsByCourseId.set(session.course_id, existing);
  }

  const completedIntentByReservationId = new Map(
    intents
      .filter((intent) => intent.status === "checkout_completed" && intent.stripe_subscription_id)
      .map((intent) => [intent.trial_reservation_id, intent])
  );
  const trialTicketByReservationId = new Map(
    (trialTicketsResult.data ?? [])
      .filter((ticket) => ticket.trial_reservation_id)
      .map((ticket) => [ticket.trial_reservation_id as string, ticket])
  );
  const subscriptionTicketById = new Map(
    (subscriptionTicketsResult.data ?? [])
      .filter((ticket) => ticket.subscription_id)
      .map((ticket) => [ticket.subscription_id as string, ticket])
  );
  const workshopTicketByBookingId = new Map(
    (workshopTicketsResult.data ?? [])
      .filter((ticket) => ticket.booking_id)
      .map((ticket) => [ticket.booking_id as string, ticket])
  );
  const attendanceByKey = new Map(
    ((attendanceRows as AttendanceRow[] | null) ?? []).map((row) => [
      createAttendanceKey(row.course_id, row.session_id, row.event_date ?? "", row.ticket_id),
      row.checked_in_at,
    ])
  );

  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const activeCourseParticipantsCount = intents.filter(
    (intent) =>
      intent.status === "checkout_completed" &&
      intent.stripe_subscription_id &&
      !["cancel_scheduled", "cancelled"].includes(intent.subscription_status ?? "")
  ).length;

  const activeWorkshopParticipantsCount = bookings.filter((booking) => {
    if (!booking.course_id || booking.status !== "paid" || booking.refunded_at || booking.stripe_refund_id) return false;
    const course = courseById.get(booking.course_id);
    if (!course) return false;
    const reference = course.ends_at ?? course.starts_at;
    const timestamp = reference ? new Date(reference).getTime() : Number.NaN;
    return !Number.isFinite(timestamp) || timestamp >= now;
  }).length;

  let openTrialCheckInsCount = 0;
  for (const reservation of reservations) {
    if (completedIntentByReservationId.has(reservation.id)) continue;
    if (reservation.cancelled_at || reservation.decision_status === "rejected") continue;

    const course = courseById.get(reservation.course_id);
    const ticket = trialTicketByReservationId.get(reservation.id);
    if (!course || !ticket) continue;

    const event = getTrialEvent(reservation, sessionsByCourseId.get(course.id) ?? []);
    if (!event?.isUpcomingOrCurrent) continue;

    const checkedInAt =
      attendanceByKey.get(createAttendanceKey(course.id, event.sessionId, event.eventDate, ticket.id)) ??
      ticket.checked_in_at ??
      null;
    if (!checkedInAt) openTrialCheckInsCount += 1;
  }

  let openCourseCheckInsCount = 0;
  for (const intent of intents) {
    if (intent.status !== "checkout_completed" || !intent.stripe_subscription_id) continue;
    if (!["active", "pause_scheduled"].includes(intent.subscription_status ?? "active")) continue;

    const course = courseById.get(intent.course_id);
    const ticket = subscriptionTicketById.get(intent.stripe_subscription_id);
    if (!course || !ticket) continue;

    const event = getUpcomingCourseEvent(course, sessionsByCourseId.get(course.id) ?? []);
    if (!event?.isUpcomingOrCurrent) continue;

    const checkedInAt =
      attendanceByKey.get(createAttendanceKey(course.id, event.sessionId, event.eventDate, ticket.id)) ?? null;
    if (!checkedInAt) openCourseCheckInsCount += 1;
  }

  let openWorkshopCheckInsCount = 0;
  for (const booking of bookings) {
    if (!booking.course_id || booking.status !== "paid" || booking.refunded_at || booking.stripe_refund_id) continue;

    const course = courseById.get(booking.course_id);
    const ticket = workshopTicketByBookingId.get(booking.id);
    if (!course || !ticket) continue;

    const event = getUpcomingCourseEvent(course, sessionsByCourseId.get(course.id) ?? []);
    if (!event?.isUpcomingOrCurrent) continue;

    const checkedInAt =
      attendanceByKey.get(createAttendanceKey(course.id, event.sessionId, event.eventDate, ticket.id)) ??
      ticket.checked_in_at ??
      booking.checked_in_at ??
      null;
    if (!checkedInAt) openWorkshopCheckInsCount += 1;
  }

  const currentMonth = new Date().toISOString().slice(0, 7);
  let currentMonthRevenueCents = 0;

  for (const intent of intents) {
    if (intent.status !== "checkout_completed" || !intent.stripe_subscription_id || !intent.completed_at) continue;
    const course = courseById.get(intent.course_id);
    if (!course?.price_cents) continue;
    if (intent.completed_at.slice(0, 7) !== currentMonth) continue;

    currentMonthRevenueCents += calculateCoursePriceBreakdown(course.price_cents, providerType).payoutCents;
  }

  for (const booking of bookings) {
    if (!booking.course_id || booking.status !== "paid" || !booking.created_at) continue;
    if (booking.refunded_at || booking.stripe_refund_id) continue;
    if (booking.created_at.slice(0, 7) !== currentMonth) continue;

    const course = courseById.get(booking.course_id);
    if (!course?.price_cents) continue;

    currentMonthRevenueCents += calculateCoursePriceBreakdown(course.price_cents, providerType).payoutCents;
  }

  const activeParticipantsCount = activeCourseParticipantsCount + activeWorkshopParticipantsCount;
  const openCheckInsCount = openTrialCheckInsCount + openCourseCheckInsCount + openWorkshopCheckInsCount;

  return (
    <main className="mx-auto max-w-6xl space-y-8 p-6">
      <header className="flex flex-wrap items-start justify-between gap-5">
        <div className="space-y-3">
          <div className="space-y-2">
            <h1 className="text-4xl font-semibold tracking-tight">Dashboard</h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              Verwalte Angebote, Teilnehmende, Check-ins, Anwesenheiten und Einnahmen in einer klaren Übersicht.
            </p>
            <p className="text-sm text-muted-foreground">
              Eingeloggt als <span className="font-medium text-foreground">{user.email}</span>
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <Link
            href="/dashboard/check-in"
            className="inline-flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-foreground transition hover:border-foreground/20 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
              <path d="M4 7h16" />
              <path d="M7 4v6" />
              <path d="M17 4v6" />
              <rect x="4" y="6" width="16" height="14" rx="2" />
              <path d="m9 14 2 2 4-4" />
            </svg>
            <span>Check-in</span>
          </Link>
          <LogoutButton />
        </div>
      </header>

      {profileSaved ? (
        <p className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          Profil gespeichert.
        </p>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-2">
        <DashboardNavCard
          href="/dashboard/courses"
          title="Meine Angebote"
          description="Verwalte deine laufenden und einmaligen Angebote und lege neue Angebote an."
          footerLabel="Aktive Angebote"
          footerValue={String(publishedOffersCount)}
          tone="green"
          icon={
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
              <path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l10-6.86a1 1 0 0 0 0-1.72l-10-6.86a1 1 0 0 0-1.5.86Z" />
            </svg>
          }
        />

        <DashboardNavCard
          href="/dashboard/participants"
          title="Teilnehmende"
          description="Hier siehst du, wer sich für deine Angebote angemeldet hat."
          footerLabel="Aktive Teilnehmende"
          footerValue={String(activeParticipantsCount)}
          tone="blue"
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
              <path d="M16 19a4 4 0 0 0-8 0" />
              <circle cx="12" cy="11" r="3" />
              <path d="M5 19a3 3 0 0 1 3-3" />
              <path d="M19 19a3 3 0 0 0-3-3" />
            </svg>
          }
        />

        <DashboardNavCard
          href="/dashboard/attendance"
          title="Anwesenheiten"
          description="Übersicht über Check-ins, Anwesenheiten und offene Teilnahmen."
          footerLabel="Ausstehende Check-ins"
          footerValue={String(openCheckInsCount)}
          tone="orange"
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
              <rect x="4" y="6" width="16" height="12" rx="2" />
              <path d="M8 10h4" />
              <path d="m10 14 2 2 4-4" />
            </svg>
          }
        />

        <DashboardNavCard
          href="/dashboard/earnings"
          title="Einnahmen & Auszahlungen"
          description="Übersicht über deine bisherigen Einnahmen und Umsätze."
          footerLabel="Einnahmen diesen Monat"
          footerValue={formatCurrency(currentMonthRevenueCents)}
          tone="neutral"
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
              <path d="M4 19h16" />
              <path d="M7 15V9" />
              <path d="M12 15V5" />
              <path d="M17 15v-3" />
            </svg>
          }
        />

        <DashboardNavCard
          href="/dashboard/payout-profile"
          title="Auszahlungen"
          description="Lege deine spaetere Auszahlungsmethode fuer Payment-V2-Payouts fest."
          footerLabel="Payout-Profil"
          footerValue={payoutProfileValue}
          tone="neutral"
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
              <rect x="3.5" y="6" width="17" height="12" rx="2" />
              <path d="M7 12h10" />
              <path d="M7 9h3" />
            </svg>
          }
        />

        <DashboardNavCard
          href="/dashboard/profile"
          title="Profil"
          description="Bearbeite deine persönlichen Angaben, Beschreibung und Auszahlungsdaten."
          footerLabel="Profilstatus"
          footerValue={profileComplete ? "Profil vollständig" : "Profil unvollständig"}
          tone="neutral"
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
              <circle cx="12" cy="8" r="3.2" />
              <path d="M5 19a7 7 0 0 1 14 0" />
            </svg>
          }
        />

        <DashboardNavCard
          href="/dashboard/guide"
          title="Kurz-Anleitung"
          description="Hier findest du eine schnelle Erklärung zu RESER, deinen Angeboten, Teilnehmenden, Check-ins und den wichtigsten Symbolen."
          footerLabel="Hilfe & Funktionen"
          footerValue="Anleitung"
          tone="neutral"
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
              <circle cx="12" cy="12" r="8" />
              <path d="M12 16v.01" />
              <path d="M10.8 9.3a1.8 1.8 0 1 1 2.7 1.56c-.9.5-1.5.94-1.5 2.14" />
            </svg>
          }
        />
      </section>
    </main>
  );
}
