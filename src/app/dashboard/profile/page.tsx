import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import ProfileForm from "./ProfileForm";

type ProfileRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  bio: string | null;
  photo_url: string | null;
  intro_video_url: string | null;
  stripe_account_id: string | null;
};

export default async function DashboardProfilePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const stripeConnectedParam = Array.isArray(sp.stripe_connected) ? sp.stripe_connected[0] : sp.stripe_connected;
  const stripeErrorParam = Array.isArray(sp.stripe_error) ? sp.stripe_error[0] : sp.stripe_error;
  const stripeErrorDetailParam = Array.isArray(sp.stripe_error_detail)
    ? sp.stripe_error_detail[0]
    : sp.stripe_error_detail;
  const stripeConnected = stripeConnectedParam === "1";
  const stripeError = stripeErrorParam === "1";
  const stripeErrorDetail = process.env.NODE_ENV !== "production" ? stripeErrorDetailParam : undefined;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id,first_name,last_name,bio,photo_url,intro_video_url,stripe_account_id")
    .eq("id", user.id)
    .maybeSingle<ProfileRow>();

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <Link href="/dashboard" className="inline-flex text-sm font-medium underline underline-offset-4">
        Zurueck zum Dashboard
      </Link>

      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Mein Profil</h1>
        <p className="text-sm text-muted-foreground">
          Diese Angaben bilden die Grundlage fuer dein Dozent*innen-Profil.
        </p>
      </header>

      {stripeConnected ? (
        <p className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          Stripe-Konto verbunden.
        </p>
      ) : null}

      {stripeError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <p>Stripe-Onboarding konnte nicht gestartet werden.</p>
          {stripeErrorDetail ? <p className="mt-1 text-xs">{stripeErrorDetail}</p> : null}
        </div>
      ) : null}

      <section className="rounded-2xl border p-6">
        <h2 className="text-lg font-semibold">Zahlungen</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {profile?.stripe_account_id
            ? "Dein Stripe-Konto ist verbunden. Ueber Stripe verwaltest du deine Auszahlungsdaten und Bankverbindung."
            : "Richte dein Stripe-Konto ein, damit Einnahmen aus Workshops und Kurs-Abos automatisch auf dein Konto ausgezahlt werden koennen."}
        </p>
        {profile?.stripe_account_id ? (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <p className="inline-flex rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm font-medium text-green-700">
              Stripe-Konto verbunden
            </p>
            <Link
              href="/api/stripe/connect/login"
              className="inline-flex rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white"
            >
              Auszahlungsdaten verwalten
            </Link>
          </div>
        ) : (
          <Link
            href="/api/stripe/connect"
            className="mt-4 inline-flex rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white"
          >
            Zahlungsdaten einrichten
          </Link>
        )}
      </section>

      <div className="rounded-2xl border p-6">
        <ProfileForm
          initialValues={{
            first_name: profile?.first_name ?? "",
            last_name: profile?.last_name ?? "",
            bio: profile?.bio ?? "",
            photo_url: profile?.photo_url ?? "",
            intro_video_url: profile?.intro_video_url ?? "",
          }}
        />
      </div>
    </main>
  );
}
