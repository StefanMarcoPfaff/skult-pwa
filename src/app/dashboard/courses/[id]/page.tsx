import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { setCoursePublishStateAction } from "./actions";

type Row = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string | null;
  capacity: number | null;
  kind: string | null;
  is_published: boolean | null;
};

type SessionRow = {
  id: string;
  course_id: string;
  starts_at: string | null;
  ends_at: string | null;
};

function formatDateTime(dt: string | null) {
  if (!dt) return "";
  const d = new Date(dt);
  const date = d.toLocaleDateString("de-DE");
  const time = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  return `${date}, ${time}`;
}

function formatSessionDateTime(dt: string | null) {
  if (!dt) return "-";
  return new Date(dt).toLocaleString("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  });
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
    .select("id,title,description,location,starts_at,capacity,kind,is_published")
    .eq("id", id)
    .single<Row>();

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
        <Link href="/dashboard" style={{ fontWeight: 700 }}>
          Zurueck
        </Link>
        <p style={{ marginTop: 16, fontSize: 18, fontWeight: 800 }}>Nicht gefunden</p>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, maxWidth: 820 }}>
      <Link href="/dashboard" style={{ fontWeight: 700 }}>
        Zurueck
      </Link>

      <h1 style={{ marginTop: 16, fontSize: 32, fontWeight: 900 }}>{data.title}</h1>

      {savedParam === "published" ? (
        <p className="mt-4 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          Angebot wurde veröffentlicht.
        </p>
      ) : null}
      {savedParam === "draft" ? (
        <p className="mt-4 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          Angebot wurde als Entwurf gespeichert.
        </p>
      ) : null}

      <div style={{ marginTop: 10, opacity: 0.8 }}>
        <div>Art: {data.kind ?? "-"}</div>
        <div>Veroeffentlicht: {data.is_published ? "Ja" : "Nein"}</div>
        {data.location ? <div>Ort: {data.location}</div> : null}
        {data.starts_at ? <div>Start: {formatDateTime(data.starts_at)}</div> : null}
        {data.capacity !== null ? <div>Plaetze: {data.capacity}</div> : null}
      </div>

      {data.description ? (
        <p style={{ marginTop: 16, lineHeight: 1.6 }}>{data.description}</p>
      ) : null}

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

      <section className="mt-8 rounded-2xl border p-4">
        <p className="text-sm font-medium">
          {data.is_published
            ? "Dieses Angebot ist veröffentlicht."
            : "Dieses Angebot ist noch nicht veröffentlicht."}
        </p>

        {data.is_published && hasRegistrations ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Die Veröffentlichung kann nicht zurückgezogen werden, weil bereits
            Anmeldungen vorliegen.
          </p>
        ) : (
          <form action={setCoursePublishStateAction} className="mt-3">
            <input type="hidden" name="course_id" value={data.id} />
            <input
              type="hidden"
              name="mode"
              value={data.is_published ? "draft" : "published"}
            />
            <button type="submit" className="rounded-xl border px-4 py-2 text-sm font-semibold">
              {data.is_published ? "Veröffentlichung zurückziehen" : "Jetzt veröffentlichen"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
