import Link from "next/link";
import { redirect } from "next/navigation";
import type {
  ProviderBillingProfile,
  ProviderBillingPayoutMethod,
  ProviderBillingVatStatus,
} from "@/lib/provider-billing-profile";
import { getProviderBillingProfile } from "@/lib/provider-billing-profile";
import type { ProviderType } from "@/lib/provider-profiles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import ProfileForm from "./ProfileForm";

type ProfileRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  bio: string | null;
  photo_url: string | null;
  company_logo_url: string | null;
  intro_video_url: string | null;
  provider_type: ProviderType | null;
  organization_name: string | null;
};

export default async function DashboardProfilePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const onboardingParam = Array.isArray(sp.onboarding) ? sp.onboarding[0] : sp.onboarding;
  const onboarding = onboardingParam === "1";

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: profile }, financialProfile] = await Promise.all([
    supabase
      .from("profiles")
      .select("id,first_name,last_name,bio,photo_url,company_logo_url,intro_video_url,provider_type,organization_name")
      .eq("id", user.id)
      .maybeSingle<ProfileRow>(),
    getProviderBillingProfile(supabase, user.id) as Promise<ProviderBillingProfile | null>,
  ]);

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <Link href="/dashboard" className="inline-flex text-sm font-medium underline underline-offset-4">
        Zurueck zum Dashboard
      </Link>

      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Mein Profil</h1>
        <p className="text-sm text-muted-foreground">
          Diese Angaben bilden die Grundlage fuer dein Profil als Anbietende.
        </p>
      </header>

      {onboarding ? (
        <p className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
          Willkommen. Bitte vervollstaendige jetzt dein Profil, damit du anschliessend Angebote anlegen kannst.
        </p>
      ) : null}

      <div className="rounded-2xl border p-6">
        <ProfileForm
          initialValues={{
            first_name: profile?.first_name ?? "",
            last_name: profile?.last_name ?? "",
            bio: profile?.bio ?? "",
            photo_url: profile?.photo_url ?? "",
            company_logo_url: profile?.company_logo_url ?? "",
            intro_video_url: profile?.intro_video_url ?? "",
            provider_type: profile?.provider_type ?? "independent_teacher",
            organization_name: profile?.organization_name ?? "",
            payout_method: (financialProfile?.payoutMethod ?? "iban") as ProviderBillingPayoutMethod,
            billing_name: financialProfile?.billingName ?? "",
            billing_company_name: financialProfile?.billingCompanyName ?? "",
            billing_address_line_1: financialProfile?.billingAddressLine1 ?? "",
            billing_address_line_2: financialProfile?.billingAddressLine2 ?? "",
            billing_postal_code: financialProfile?.billingPostalCode ?? "",
            billing_city: financialProfile?.billingCity ?? "",
            billing_country: financialProfile?.billingCountry ?? "",
            tax_number: financialProfile?.taxNumber ?? "",
            vat_id: financialProfile?.vatId ?? "",
            vat_status: (financialProfile?.vatStatus ?? "") as ProviderBillingVatStatus | "",
            payout_iban: financialProfile?.payoutIban ?? "",
            payout_paypal_email: financialProfile?.payoutPaypalEmail ?? "",
          }}
        />
      </div>
    </main>
  );
}
