import Link from "next/link";
import LogoutButton from "./logout-button";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
    return <div>Bitte einloggen.</div>;
  }

  const [{ count: totalOffersCount }, { count: publishedOffersCount }, { data: profile }] =
    await Promise.all([
      supabase
        .from("courses")
        .select("id", { count: "exact", head: true })
        .eq("teacher_id", user.id),
      supabase
        .from("courses")
        .select("id", { count: "exact", head: true })
        .eq("teacher_id", user.id)
        .eq("is_published", true),
      supabase
        .from("profiles")
        .select("first_name,last_name")
        .eq("id", user.id)
        .maybeSingle<{ first_name: string | null; last_name: string | null }>(),
    ]);

  const profileComplete = Boolean(profile?.first_name && profile?.last_name);

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Hier verwaltest du dein Profil, deine Angebote und spaeter deine Teilnehmer*innen.
          </p>
          <p className="text-sm text-muted-foreground">
            Eingeloggt als <span className="font-medium text-foreground">{user.email}</span>
          </p>
        </div>
        <LogoutButton />
      </div>

      {profileSaved ? (
        <p className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          Profil gespeichert.
        </p>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border p-4">
          <p className="text-sm text-muted-foreground">Angebote gesamt</p>
          <p className="mt-1 text-2xl font-semibold">{totalOffersCount ?? 0}</p>
        </div>
        <div className="rounded-2xl border p-4">
          <p className="text-sm text-muted-foreground">Veroeffentlichte Angebote</p>
          <p className="mt-1 text-2xl font-semibold">{publishedOffersCount ?? 0}</p>
        </div>
        <div className="rounded-2xl border p-4">
          <p className="text-sm text-muted-foreground">Profilstatus</p>
          <p className="mt-1 text-base font-semibold">
            {profileComplete ? "Profil vollstaendig" : "Profil unvollstaendig"}
          </p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <article className="rounded-2xl border p-5">
          <h2 className="text-lg font-semibold">Mein Profil</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Bearbeite deine persoenlichen Angaben, Selbstbeschreibung und Auszahlungsdaten.
          </p>
          <Link
            href="/dashboard/profile"
            className="mt-4 inline-flex rounded-xl border px-4 py-2 text-sm font-semibold"
          >
            Zum Profil
          </Link>
        </article>

        <article className="rounded-2xl border p-5">
          <h2 className="text-lg font-semibold">Meine Angebote</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Verwalte deine Kurse und Workshops und lege neue Angebote an.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/dashboard/courses"
              className="inline-flex rounded-xl border px-4 py-2 text-sm font-semibold"
            >
              Zu meinen Angeboten
            </Link>
            <Link
              href="/dashboard/courses/new"
              className="inline-flex rounded-xl border px-4 py-2 text-sm font-semibold"
            >
              Neues Angebot
            </Link>
          </div>
        </article>

        <article className="rounded-2xl border p-5">
          <h2 className="text-lg font-semibold">Teilnehmer*innen</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Hier siehst du spaeter, wer sich fuer deine Kurse und Workshops angemeldet hat.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/dashboard/participants"
              className="inline-flex rounded-xl border px-4 py-2 text-sm font-semibold"
            >
              Zu Teilnehmer*innen
            </Link>
            <Link
              href="/dashboard/check-in"
              className="inline-flex rounded-xl border px-4 py-2 text-sm font-semibold"
            >
              Ticket-Check-in
            </Link>
          </div>
        </article>
      </section>
    </main>
  );
}
