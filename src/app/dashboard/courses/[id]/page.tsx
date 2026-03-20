import Link from "next/link";
import { redirect } from "next/navigation";
import {
  getCancellationModelLabel,
  getProviderDisplayName,
  getWorkshopStornoPolicyLabel,
  type ProviderType,
} from "@/lib/provider-profiles";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { setCoursePublishStateAction } from "./actions";

type Row = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  location_details: string | null;
  starts_at: string | null;
  capacity: number | null;
  kind: string | null;
  is_published: boolean | null;
  trial_mode: string | null;
  instructor_name: string | null;
  cancellation_model: string | null;
  workshop_storno_policy: string | null;
  teacher_id: string;
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
  provider_type: ProviderType | null;
  organization_name: string | null;
};

type TrialParticipantRow = {
  id: string;
  course_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  decision_status: string | null;
  approved_at: string | null;
  trial_starts_at: string | null;
  trial_ends_at: string | null;
  registration_expires_at: string | null;
  converted_at: string | null;
  converted_registration_intent_id: string | null;
};

type TrialTicketRow = {
  trial_reservation_id: string | null;
  status: string | null;
  checked_in_at: string | null;
};

type RegistrationIntentRow = {
  id: string;
  trial_reservation_id: string;
  status: string | null;
};

type WorkshopBookingRow = {
  id: string;
  course_id: string | null;
  status: string | null;
  attendee_key: string | null;
  checked_in_at: string | null;
  created_at: string | null;
  customer_first_name: string | null;
  customer_last_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
};

type WorkshopTicketRow = {
  booking_id: string | null;
  customer_name: string;
  customer_email: string;
  status: string | null;
  checked_in_at: string | null;
};

type CourseParticipantEntry = {
  id: string;
  name: string;
  email: string | null;
  statusLabel: string;
  checkInLabel: string;
  meta: string | null;
};

type WorkshopParticipantEntry = {
  id: string;
  name: string;
  email: string | null;
  statusLabel: string;
  checkInLabel: string;
  meta: string | null;
};

function formatDateTime(dt: string | null) {
  if (!dt) return "";
  const d = new Date(dt);
  const date = d.toLocaleDateString("de-DE");
  const time = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  return `${date} | ${time}`;
}

function formatTrialMode(value: string | null): string {
  if (value === "manual") return "Nur an ausgewaehlten Terminen";
  return "An jedem Termin moeglich";
}

function formatName(firstName: string | null, lastName: string | null, fallback: string): string {
  return [firstName, lastName].filter(Boolean).join(" ").trim() || fallback;
}

function formatDateTimeRange(start: string | null, end: string | null): string | null {
  if (!start) return null;
  const startDate = new Date(start);
  if (Number.isNaN(startDate.getTime())) return null;

  const date = startDate.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const startTime = startDate.toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (!end) return `${date} | ${startTime}`;

  const endDate = new Date(end);
  if (Number.isNaN(endDate.getTime())) return `${date} | ${startTime}`;

  const endTime = endDate.toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return `${date} | ${startTime}-${endTime}`;
}

function renderParticipantGroup(
  title: string,
  description: string,
  entries: CourseParticipantEntry[]
) {
  return (
    <section className="rounded-2xl border p-5" key={title}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">{title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="rounded-full border px-3 py-1 text-sm font-semibold">{entries.length}</div>
      </div>

      {entries.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Aktuell keine Eintraege.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {entries.map((entry) => (
            <div key={entry.id} className="rounded-xl border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1 text-sm">
                  <p className="font-semibold text-foreground">{entry.name}</p>
                  {entry.email ? <p>{entry.email}</p> : null}
                  <p>
                    Status: <span className="font-medium text-foreground">{entry.statusLabel}</span>
                  </p>
                  <p>
                    Check-in: <span className="font-medium text-foreground">{entry.checkInLabel}</span>
                  </p>
                  {entry.meta ? <p>{entry.meta}</p> : null}
                </div>
                <Link
                  href={`/dashboard/participants/${entry.id}?source=trial`}
                  className="inline-flex rounded-xl border px-3 py-2 text-xs font-semibold"
                >
                  Details
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function renderWorkshopParticipantGroup(
  title: string,
  description: string,
  entries: WorkshopParticipantEntry[]
) {
  return (
    <section className="rounded-2xl border p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">{title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="rounded-full border px-3 py-1 text-sm font-semibold">{entries.length}</div>
      </div>

      {entries.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Aktuell keine Einträge.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {entries.map((entry) => (
            <div key={entry.id} className="rounded-xl border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1 text-sm">
                  <p className="font-semibold text-foreground">{entry.name}</p>
                  {entry.email ? <p>{entry.email}</p> : null}
                  <p>
                    Status: <span className="font-medium text-foreground">{entry.statusLabel}</span>
                  </p>
                  <p>
                    Check-in: <span className="font-medium text-foreground">{entry.checkInLabel}</span>
                  </p>
                  {entry.meta ? <p>{entry.meta}</p> : null}
                </div>
                <Link
                  href={`/dashboard/participants/${entry.id}?source=workshop`}
                  className="inline-flex rounded-xl border px-3 py-2 text-xs font-semibold"
                >
                  Details
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default async function DashboardCourseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const savedParam = Array.isArray(sp.saved) ? sp.saved[0] : sp.saved;

  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdmin();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data, error } = await supabase
    .from("courses")
    .select("id,title,description,location,location_details,starts_at,capacity,kind,is_published,trial_mode,instructor_name,cancellation_model,workshop_storno_policy,teacher_id")
    .eq("id", id)
    .eq("teacher_id", user.id)
    .single<Row>();

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name,last_name,provider_type,organization_name")
    .eq("id", user.id)
    .maybeSingle<ProfileRow>();

  const { data: sessions } = await supabase
    .from("course_sessions")
    .select("*")
    .eq("course_id", id)
    .order("starts_at", { ascending: true })
    .returns<SessionRow[]>();

  const { count: registrationsCount } = await supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("course_id", id);
  const hasRegistrations = (registrationsCount ?? 0) > 0;

  const { data: trialParticipants } = data?.kind === "course"
    ? await admin
        .from("trial_reservations")
        .select(
          "id,course_id,first_name,last_name,email,decision_status,approved_at,trial_starts_at,trial_ends_at,registration_expires_at,converted_at,converted_registration_intent_id"
        )
        .eq("course_id", id)
        .order("trial_starts_at", { ascending: false })
        .returns<TrialParticipantRow[]>()
    : { data: [] as TrialParticipantRow[] };

  const trialReservationIds = (trialParticipants ?? []).map((participant) => participant.id);
  const [{ data: trialTickets }, { data: registrationIntents }] =
    data?.kind === "course" && trialReservationIds.length > 0
      ? await Promise.all([
          admin
            .from("tickets")
            .select("trial_reservation_id,status,checked_in_at")
            .in("trial_reservation_id", trialReservationIds)
            .returns<TrialTicketRow[]>(),
          admin
            .from("course_registration_intents")
            .select("id,trial_reservation_id,status")
            .in("trial_reservation_id", trialReservationIds)
            .returns<RegistrationIntentRow[]>(),
        ])
      : [{ data: [] as TrialTicketRow[] }, { data: [] as RegistrationIntentRow[] }];

  const { data: workshopBookings } = data?.kind === "workshop"
      ? await admin
        .from("bookings")
        .select("id,course_id,status,attendee_key,checked_in_at,created_at,customer_first_name,customer_last_name,customer_email,customer_phone")
        .eq("course_id", id)
        .eq("status", "paid")
        .order("created_at", { ascending: false })
        .returns<WorkshopBookingRow[]>()
    : { data: [] as WorkshopBookingRow[] };

  const workshopBookingIds = (workshopBookings ?? []).map((booking) => booking.id);
  const { data: workshopTickets } =
    data?.kind === "workshop" && workshopBookingIds.length > 0
      ? await admin
          .from("tickets")
          .select("booking_id,customer_name,customer_email,status,checked_in_at")
          .in("booking_id", workshopBookingIds)
          .returns<WorkshopTicketRow[]>()
      : { data: [] as WorkshopTicketRow[] };

  if (error || !data) {
    return (
      <main style={{ padding: 24 }}>
        <Link href="/dashboard/courses" style={{ fontWeight: 700 }}>
          Zurueck
        </Link>
        <p style={{ marginTop: 16, fontSize: 18, fontWeight: 800 }}>Nicht gefunden</p>
      </main>
    );
  }

  const providerLabel =
    profile?.provider_type === "studio_provider"
      ? getProviderDisplayName("studio_provider", {
          first_name: profile.first_name,
          last_name: profile.last_name,
          organization_name: profile.organization_name,
        })
      : null;

  const ticketByTrialReservationId = new Map(
    (trialTickets ?? [])
      .filter((ticket) => ticket.trial_reservation_id)
      .map((ticket) => [ticket.trial_reservation_id as string, ticket])
  );
  const intentByTrialReservationId = new Map(
    (registrationIntents ?? []).map((intent) => [intent.trial_reservation_id, intent])
  );

  const groupedCourseParticipants =
    data.kind === "course"
      ? {
          firmlyRegistered: (trialParticipants ?? [])
            .filter((participant) => {
              const intent = intentByTrialReservationId.get(participant.id);
              return participant.converted_at || intent?.status === "checkout_completed";
            })
            .map<CourseParticipantEntry>((participant) => ({
              id: participant.id,
              name: formatName(participant.first_name, participant.last_name, "Teilnehmer*in"),
              email: participant.email,
              statusLabel: "Verbindlich angemeldet",
              checkInLabel:
                ticketByTrialReservationId.get(participant.id)?.status === "checked_in"
                  ? `Eingecheckt am ${formatDateTime(
                      ticketByTrialReservationId.get(participant.id)?.checked_in_at ?? null
                    )}`
                  : ticketByTrialReservationId.get(participant.id)?.status === "issued"
                    ? "Noch nicht eingecheckt"
                    : "-",
              meta: participant.converted_at
                ? `Anmeldung abgeschlossen am ${formatDateTime(participant.converted_at)}`
                : formatDateTimeRange(participant.trial_starts_at, participant.trial_ends_at),
            })),
          attendedApproved: (trialParticipants ?? [])
            .filter((participant) => {
              const ticket = ticketByTrialReservationId.get(participant.id);
              const intent = intentByTrialReservationId.get(participant.id);
              const isConverted = participant.converted_at || intent?.status === "checkout_completed";
              return !isConverted && participant.decision_status === "approved" && ticket?.status === "checked_in";
            })
            .map<CourseParticipantEntry>((participant) => ({
              id: participant.id,
              name: formatName(participant.first_name, participant.last_name, "Probeschueler*in"),
              email: participant.email,
              statusLabel: "Freigegeben, noch nicht angemeldet",
              checkInLabel: `Eingecheckt am ${formatDateTime(
                ticketByTrialReservationId.get(participant.id)?.checked_in_at ?? null
              )}`,
              meta: participant.registration_expires_at
                ? `Freigegeben bis ${formatDateTime(participant.registration_expires_at)}`
                : formatDateTimeRange(participant.trial_starts_at, participant.trial_ends_at),
            })),
          attendedPending: (trialParticipants ?? [])
            .filter((participant) => {
              const ticket = ticketByTrialReservationId.get(participant.id);
              return participant.decision_status === "pending" && ticket?.status === "checked_in";
            })
            .map<CourseParticipantEntry>((participant) => ({
              id: participant.id,
              name: formatName(participant.first_name, participant.last_name, "Probeschueler*in"),
              email: participant.email,
              statusLabel: "Teilgenommen, Entscheidung offen",
              checkInLabel: `Eingecheckt am ${formatDateTime(
                ticketByTrialReservationId.get(participant.id)?.checked_in_at ?? null
              )}`,
              meta: formatDateTimeRange(participant.trial_starts_at, participant.trial_ends_at),
            })),
          notYetAttended: (trialParticipants ?? [])
            .filter((participant) => {
              const ticket = ticketByTrialReservationId.get(participant.id);
              const intent = intentByTrialReservationId.get(participant.id);
              const isConverted = participant.converted_at || intent?.status === "checkout_completed";
              return !isConverted && ticket?.status !== "checked_in";
            })
            .map<CourseParticipantEntry>((participant) => ({
              id: participant.id,
              name: formatName(participant.first_name, participant.last_name, "Probeschueler*in"),
              email: participant.email,
              statusLabel: "Noch nicht teilgenommen",
              checkInLabel:
                ticketByTrialReservationId.get(participant.id)?.status === "issued"
                  ? "Ticket ausgestellt, noch nicht eingecheckt"
                  : "Noch nicht eingecheckt",
              meta: formatDateTimeRange(participant.trial_starts_at, participant.trial_ends_at),
            })),
        }
      : null;

  const workshopTicketByBookingId = new Map(
    (workshopTickets ?? [])
      .filter((ticket) => ticket.booking_id)
      .map((ticket) => [ticket.booking_id as string, ticket])
  );
  const workshopParticipants =
    data.kind === "workshop"
      ? (workshopBookings ?? []).map<WorkshopParticipantEntry>((booking) => {
          const ticket = workshopTicketByBookingId.get(booking.id);
          return {
            id: booking.id,
            name:
              formatName(booking.customer_first_name, booking.customer_last_name, ticket?.customer_name || "Workshop-Gast"),
            email: booking.customer_email ?? ticket?.customer_email ?? null,
            statusLabel: booking.status === "paid" ? "Gebucht" : booking.status ?? "-",
            checkInLabel: ticket?.checked_in_at ?? booking.checked_in_at
              ? `Eingecheckt am ${formatDateTime(ticket?.checked_in_at ?? booking.checked_in_at)}`
              : "Noch nicht eingecheckt",
            meta: booking.created_at ? `Gebucht am ${formatDateTime(booking.created_at)}` : null,
          };
        })
      : [];

  return (
    <main style={{ padding: 24, maxWidth: 820 }}>
      <Link href="/dashboard/courses" style={{ fontWeight: 700 }}>
        Zurueck
      </Link>

      <h1 style={{ marginTop: 16, fontSize: 32, fontWeight: 900 }}>{data.title}</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Dies ist deine interne Vorschau. Pruefe die Angaben, passe sie bei Bedarf an und
        veroeffentliche das Angebot erst danach.
      </p>

      {savedParam === "1" ? (
        <p className="mt-4 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          Angebot wurde aktualisiert.
        </p>
      ) : null}
      {savedParam === "published" ? (
        <p className="mt-4 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          Angebot wurde veroeffentlicht.
        </p>
      ) : null}
      {savedParam === "draft" ? (
        <p className="mt-4 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          Angebot wurde als Entwurf gespeichert.
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href={`/dashboard/courses/${data.id}/edit`}
          className="inline-flex rounded-xl border px-4 py-2 text-sm font-semibold"
        >
          Aendern
        </Link>

        {data.is_published && hasRegistrations ? null : (
          <form action={setCoursePublishStateAction}>
            <input type="hidden" name="course_id" value={data.id} />
            <input type="hidden" name="mode" value={data.is_published ? "draft" : "published"} />
            <button type="submit" className="rounded-xl border px-4 py-2 text-sm font-semibold">
              {data.is_published ? "Veroeffentlichung zurueckziehen" : "Jetzt veroeffentlichen"}
            </button>
          </form>
        )}
      </div>

      <div style={{ marginTop: 10, opacity: 0.8 }}>
        <div>Art: {data.kind ?? "-"}</div>
        <div>Veroeffentlicht: {data.is_published ? "Ja" : "Nein"}</div>
        {data.kind === "course" ? <div>Probestunden-Regel: {formatTrialMode(data.trial_mode)}</div> : null}
        {providerLabel ? <div>Anbieter: {providerLabel}</div> : null}
        {data.instructor_name ? <div>Dozent: {data.instructor_name}</div> : null}
        {data.kind === "course" ? (
          <div>Kuendigungsmodell: {getCancellationModelLabel(data.cancellation_model)}</div>
        ) : null}
        {data.kind === "workshop" ? (
          <div>Storno-Regel: {getWorkshopStornoPolicyLabel(data.workshop_storno_policy)}</div>
        ) : null}
        {data.location ? <div>Ort: {data.location}</div> : null}
        {data.location_details ? (
          <div>Raum / Zusatzinfo: {data.location_details}</div>
        ) : null}
        {data.kind === "course" && data.starts_at ? <div>Kursstart: {formatDateTime(data.starts_at)}</div> : null}
        {data.kind !== "course" && data.starts_at ? <div>Start: {formatDateTime(data.starts_at)}</div> : null}
        {data.capacity !== null ? <div>Plaetze: {data.capacity}</div> : null}
      </div>

      {data.description ? <p style={{ marginTop: 16, lineHeight: 1.6 }}>{data.description}</p> : null}

      {data.kind === "workshop" ? (
        <section style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 22, fontWeight: 800 }}>Termine</h2>
          <div style={{ marginTop: 8, borderTop: "1px solid #ddd", paddingTop: 12 }}>
            {sessions && sessions.length > 0 ? (
              sessions.map((session) => (
                <div key={session.id} style={{ marginBottom: 8 }}>
                  {session.starts_at ? (
                    <>
                      {new Date(session.starts_at).toLocaleDateString("de-DE", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })}{" "}
                      |{" "}
                      {new Date(session.starts_at).toLocaleTimeString("de-DE", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      -
                      {session.ends_at
                        ? new Date(session.ends_at).toLocaleTimeString("de-DE", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "-"}
                    </>
                  ) : (
                    "-"
                  )}
                </div>
              ))
            ) : (
              <div>Keine Termine vorhanden.</div>
            )}
          </div>
        </section>
      ) : null}

      {data.kind === "course" && groupedCourseParticipants ? (
        <section className="mt-8 space-y-4">
          <div>
            <h2 className="text-2xl font-semibold">Teilnehmeruebersicht</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Hier siehst du den aktuellen Stand der verbindlichen Anmeldungen und Probeschüler für diesen Kurs.
            </p>
          </div>

          {renderParticipantGroup(
            "Fest angemeldete Teilnehmer",
            "Diese Personen haben die verbindliche Kursanmeldung erfolgreich abgeschlossen.",
            groupedCourseParticipants.firmlyRegistered
          )}

          <section className="rounded-2xl border p-5">
            <div>
              <h3 className="text-lg font-semibold">Probeschüler Status unterteilt</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Probeschüler werden nach ihrem aktuellen Fortschritt im Aufnahmeprozess gruppiert.
              </p>
            </div>
            <div className="mt-5 space-y-4">
              {renderParticipantGroup(
                "Noch nicht teilgenommen",
                "Diese Personen sind eingeplant, aber noch nicht eingecheckt.",
                groupedCourseParticipants.notYetAttended
              )}
              {renderParticipantGroup(
                "Teilgenommen, Entscheidung offen",
                "Diese Personen haben bereits teilgenommen und warten noch auf deine Entscheidung.",
                groupedCourseParticipants.attendedPending
              )}
              {renderParticipantGroup(
                "Freigegeben, noch nicht angemeldet",
                "Diese Personen wurden freigegeben, haben die verbindliche Anmeldung aber noch nicht abgeschlossen.",
                groupedCourseParticipants.attendedApproved
              )}
            </div>
          </section>
        </section>
      ) : null}

      {data.kind === "workshop" ? (
        <section className="mt-8 space-y-4">
          <div>
            <h2 className="text-2xl font-semibold">Workshop-Teilnehmer</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Alle gebuchten Teilnehmer dieses Workshops mit aktuellem Status und Check-in-Stand.
            </p>
          </div>
          {renderWorkshopParticipantGroup(
            "Alle gebuchten Teilnehmer",
            "Diese Liste zeigt alle bezahlten Workshop-Buchungen.",
            workshopParticipants
          )}
        </section>
      ) : null}

      {data.is_published && hasRegistrations ? (
        <section className="mt-8 rounded-2xl border p-4">
          <p className="text-sm text-muted-foreground">
            Die Veroeffentlichung kann nicht zurueckgezogen werden, weil bereits Anmeldungen vorliegen.
          </p>
        </section>
      ) : null}
    </main>
  );
}
