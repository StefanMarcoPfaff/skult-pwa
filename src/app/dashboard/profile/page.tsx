import Link from "next/link";
import { redirect } from "next/navigation";
import type { ProviderBillingPayoutMethod, ProviderBillingVatStatus } from "@/lib/provider-billing-profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import ProfileForm from "./ProfileForm";
import type { ProviderType } from "@/lib/provider-profiles";

type ProfileRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  bio: string | null;
  photo_url: string | null;
  intro_video_url: string | null;
  stripe_account_id: string | null;
  provider_type: ProviderType | null;
  organization_name: string | null;
  payout_method: ProviderBillingPayoutMethod | null;
  billing_name: string | null;
  billing_company_name: string | null;
  billing_address_line_1: string | null;
  billing_address_line_2: string | null;
  billing_postal_code: string | null;
  billing_city: string | null;
  billing_country: string | null;
  tax_number: string | null;
  vat_id: string | null;
  vat_status: ProviderBillingVatStatus | null;
  payout_iban: string | null;
  payout_paypal_email: string | null;
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
  const onboardingParam = Array.isArray(sp.onboarding) ? sp.onboarding[0] : sp.onboarding;
  const stripeConnected = stripeConnectedParam === "1";
  const stripeError = stripeErrorParam === "1";
  const onboarding = onboardingParam === "1";
  const stripeErrorDetail = stripeErrorDetailParam;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "id,first_name,last_name,bio,photo_url,intro_video_url,stripe_account_id,provider_type,organization_name,payout_method,billing_name,billing_company_name,billing_address_line_1,billing_address_line_2,billing_postal_code,billing_city,billing_country,tax_number,vat_id,vat_status,payout_iban,payout_paypal_email"
    )
    .eq("id", user.id)
    .maybeSingle<ProfileRow>();

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <Link href="/dashboard" className="inline-flex text-sm font-medium underline underline-offset-4">
        Zurück zum Dashboard
      </Link>

      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Mein Profil</h1>
        <p className="text-sm text-muted-foreground">
          Diese Angaben bilden die Grundlage für dein Profil als Anbietende.
        </p>
      </header>

      {onboarding ? (
        <p className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
          Willkommen. Bitte vervollständige jetzt dein Profil, damit du anschließend Angebote
          anlegen kannst.
        </p>
      ) : null}

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
        <h2 className="text-lg font-semibold">Auszahlungsprofil</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Hinterlege hier deine spaetere Auszahlungsmethode fuer Payment-V2-Payouts. Es werden noch keine echten
          Auszahlungen ausgefuehrt.
        </p>
        <Link
          href="/dashboard/payout-profile"
          className="mt-4 inline-flex rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white"
        >
          Auszahlungsprofil bearbeiten
        </Link>
      </section>

      <section className="rounded-2xl border p-6">
        <h2 className="text-lg font-semibold">Zahlungen</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {profile?.stripe_account_id
            ? "Ein Stripe-Konto ist hinterlegt. Falls Auszahlungen noch nicht aktiv sind, starte das Onboarding erneut."
            : "Richte dein Stripe-Konto ein, damit Einnahmen aus einmaligen und laufenden Angeboten automatisch auf dein Konto ausgezahlt werden können."}
        </p>
        {profile?.stripe_account_id ? (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <p className="inline-flex rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700">
              Stripe-Konto hinterlegt
            </p>
            <Link
              href="/api/stripe/connect"
              className="inline-flex rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white"
            >
              Stripe-Onboarding fortsetzen
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
            provider_type: profile?.provider_type ?? "independent_teacher",
            organization_name: profile?.organization_name ?? "",
            payout_method: profile?.payout_method ?? "iban",
            billing_name: profile?.billing_name ?? "",
            billing_company_name: profile?.billing_company_name ?? "",
            billing_address_line_1: profile?.billing_address_line_1 ?? "",
            billing_address_line_2: profile?.billing_address_line_2 ?? "",
            billing_postal_code: profile?.billing_postal_code ?? "",
            billing_city: profile?.billing_city ?? "",
            billing_country: profile?.billing_country ?? "",
            tax_number: profile?.tax_number ?? "",
            vat_id: profile?.vat_id ?? "",
            vat_status: profile?.vat_status ?? "",
            payout_iban: profile?.payout_iban ?? "",
            payout_paypal_email: profile?.payout_paypal_email ?? "",
          }}
        />
      </div>
    </main>
  );
}
