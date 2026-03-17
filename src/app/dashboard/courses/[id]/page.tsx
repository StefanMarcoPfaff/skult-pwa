import Link from "next/link";
import { redirect } from "next/navigation";
import {
  getCancellationModelLabel,
  getProviderDisplayName,
  getWorkshopStornoPolicyLabel,
  type ProviderType,
} from "@/lib/provider-profiles";
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
