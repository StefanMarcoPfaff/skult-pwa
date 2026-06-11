import Link from "next/link";
import { redirect } from "next/navigation";
import type {
  ProviderBillingProfile,
  ProviderBillingPayoutMethod,
  ProviderBillingVatStatus,
  ProviderLegalEntityType,
} from "@/lib/provider-billing-profile";
import {
  getProviderBillingProfile,
  getProviderCustomConnectReadiness,
} from "@/lib/provider-billing-profile";
import type { ProviderType } from "@/lib/provider-profiles";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
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

function getCustomConnectStatusLabel(profile: ProviderBillingProfile | null): string {
  if (!profile?.providerAccountId) return "Noch nicht vorbereitet";
  if (profile.stripePayoutsEnabled) return "Auszahlungen moeglich";
  if (profile.stripeRequirementsCurrentlyDue.length > 0 || profile.stripeRequirementsPastDue.length > 0) {
    return "Weitere Angaben erforderlich";
  }
  if (profile.stripeDetailsSubmitted) return "Angaben werden geprueft";
  return "Auszahlungsabwicklung vorbereitet";
}

function toDateInputValue(value: string | null | undefined): string {
  if (!value) return "";
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
}

export default async function DashboardProfilePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const onboardingParam = Array.isArray(sp.onboarding) ? sp.onboarding[0] : sp.onboarding;
  const onboarding = onboardingParam === "1";
  const sectionParam = Array.isArray(sp.section) ? sp.section[0] : sp.section;
  const section = sectionParam ?? "";

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const supabaseAdmin = createSupabaseAdmin();
  const [{ data: profile }, financialProfile] = await Promise.all([
    supabase
      .from("profiles")
      .select("id,first_name,last_name,bio,photo_url,company_logo_url,intro_video_url,provider_type,organization_name")
      .eq("id", user.id)
      .maybeSingle<ProfileRow>(),
    getProviderBillingProfile(supabaseAdmin, user.id) as Promise<ProviderBillingProfile | null>,
  ]);
  const customConnectReadiness = getProviderCustomConnectReadiness(financialProfile);
  const customConnectAccountExists = Boolean(financialProfile?.providerAccountId);
  const representativeBirthDate = toDateInputValue(financialProfile?.representativeBirthDate);
  const profileFormInitialValues = {
    first_name: profile?.first_name ?? "",
    last_name: profile?.last_name ?? "",
    auth_email: user.email ?? "",
    phone: financialProfile?.representativePhone ?? "",
    bio: profile?.bio ?? "",
    photo_url: profile?.photo_url ?? "",
    company_logo_url: profile?.company_logo_url ?? "",
    intro_video_url: profile?.intro_video_url ?? "",
    provider_type: profile?.provider_type ?? "independent_teacher",
    organization_name: profile?.organization_name ?? "",
    address_line_1: financialProfile?.billingAddressLine1 ?? financialProfile?.legalAddressLine1 ?? "",
    address_line_2: financialProfile?.billingAddressLine2 ?? financialProfile?.legalAddressLine2 ?? "",
    postal_code: financialProfile?.billingPostalCode ?? financialProfile?.legalPostalCode ?? "",
    city: financialProfile?.billingCity ?? financialProfile?.legalCity ?? "",
    country: financialProfile?.billingCountry ?? financialProfile?.legalCountry ?? "",
    payout_method: (financialProfile?.payoutMethod ?? "iban") as ProviderBillingPayoutMethod,
    tax_number: financialProfile?.taxNumber ?? "",
    vat_id: financialProfile?.vatId ?? "",
    vat_status: (financialProfile?.vatStatus ?? "") as ProviderBillingVatStatus | "",
    iban_last4: financialProfile?.payoutIban?.replace(/^.*(\d{4})$/, "$1") ?? "",
    paypal_email: financialProfile?.payoutPaypalEmail ?? "",
    legal_entity_type: (financialProfile?.legalEntityType ?? "") as ProviderLegalEntityType | "",
    representative_birth_date: representativeBirthDate,
    business_profile_url: financialProfile?.businessProfileUrl ?? "",
    business_profile_mcc: financialProfile?.businessProfileMcc ?? "",
    business_profile_product_description: financialProfile?.businessProfileProductDescription ?? "",
    consentAccepted: Boolean(financialProfile?.stripeTermsAcceptedAt),
    payoutComplete: Boolean(financialProfile?.payoutDestination),
    customConnectAccountExists,
    customConnectReady: customConnectReadiness.isReadyForCustomAccountCreation,
    customConnectStatusLabel: getCustomConnectStatusLabel(financialProfile),
    customConnectMissingFields: customConnectReadiness.missingFields,
    customConnectWarnings: customConnectReadiness.warnings,
    stripeRequirementsCurrentlyDue: financialProfile?.stripeRequirementsCurrentlyDue ?? [],
    stripeRequirementsPastDue: financialProfile?.stripeRequirementsPastDue ?? [],
    stripePayoutsEnabled: Boolean(financialProfile?.stripePayoutsEnabled),
  };

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
          initialValues={profileFormInitialValues}
          pageDebug={{
            loadedProviderPayoutProfileId: financialProfile?.providerPayoutProfileId ?? null,
            providerAccountId: financialProfile?.providerAccountId ?? null,
            legal_entity_type: profileFormInitialValues.legal_entity_type,
            representative_birth_date: profileFormInitialValues.representative_birth_date,
            business_profile_url: profileFormInitialValues.business_profile_url,
            business_profile_product_description: profileFormInitialValues.business_profile_product_description,
            consentAccepted: profileFormInitialValues.consentAccepted,
            payout_method: profileFormInitialValues.payout_method,
            customConnectMissingFields: customConnectReadiness.missingFields,
            customConnectReady: customConnectReadiness.isReadyForCustomAccountCreation,
          }}
          initialSection={section}
        />
      </div>
    </main>
  );
}
