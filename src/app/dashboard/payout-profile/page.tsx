import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  maskEmail,
  maskIbanLast4,
  PROVIDER_PAYOUT_PROFILE_PROVIDER,
  type ProviderPayoutMethod,
} from "@/lib/payout-profile";
import {
  getProviderBillingProfile,
  getProviderCustomConnectReadiness,
  type ProviderBillingVatStatus,
  type ProviderCustomConnectReadiness,
  type ProviderLegalEntityType,
} from "@/lib/provider-billing-profile";
import { getProfileAccountName } from "@/lib/provider-profiles";
import PayoutProfileForm from "./PayoutProfileForm";

type ProfileRow = {
  first_name: string | null;
  last_name: string | null;
  organization_name: string | null;
};

type ProviderPayoutProfileRow = {
  account_holder_name: string | null;
  address: string | null;
  payout_method: string | null;
  iban_last4: string | null;
  paypal_email: string | null;
  tax_number: string | null;
  vat_id: string | null;
  vat_status: ProviderBillingVatStatus | null;
  verification_status: string | null;
  data_transfer_consent_accepted_at: string | null;
  legal_entity_type: ProviderLegalEntityType | null;
  business_type: string | null;
  representative_first_name: string | null;
  representative_last_name: string | null;
  representative_birth_date: string | null;
  representative_email: string | null;
  representative_phone: string | null;
  legal_address_line1: string | null;
  legal_address_line2: string | null;
  legal_postal_code: string | null;
  legal_city: string | null;
  legal_country: string | null;
  stripe_terms_accepted_at: string | null;
  business_profile_url: string | null;
  business_profile_mcc: string | null;
  business_profile_product_description: string | null;
};

function formatPayoutDestination(profile: ProviderPayoutProfileRow | null): string {
  if (!profile?.payout_method) return "Noch nicht hinterlegt";
  if (profile.payout_method === "iban") {
    return maskIbanLast4(profile.iban_last4) ?? "IBAN hinterlegt";
  }
  if (profile.payout_method === "paypal") {
    return maskEmail(profile.paypal_email) ?? "PayPal hinterlegt";
  }
  return "Noch nicht hinterlegt";
}

function splitAddressFallback(address: string | null | undefined): {
  line1: string;
  line2: string;
  postalCode: string;
  city: string;
  country: string;
} {
  const lines = String(address ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const cityMatch = lines[1]?.match(/^(\S+)\s+(.+)$/);

  return {
    line1: lines[0] ?? "",
    line2: lines.length > 3 ? lines.slice(1, -2).join(", ") : "",
    postalCode: cityMatch?.[1] ?? "",
    city: cityMatch?.[2] ?? "",
    country: lines.at(-1) ?? "",
  };
}

function CustomConnectReadinessCard({ readiness }: { readiness: ProviderCustomConnectReadiness }) {
  return (
    <section className="rounded-2xl border p-5">
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
          Stripe Custom Connect Vorbereitung
        </p>
        <h2 className="text-base font-semibold">{readiness.statusLabel}</h2>
        <p className="text-sm text-muted-foreground">
          Diese Angaben werden spaeter fuer die automatische Auszahlungsabwicklung benoetigt.
        </p>
      </div>

      {readiness.missingFields.length > 0 ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-medium text-amber-900">Noch fehlende Angaben</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">
            {readiness.missingFields.map((field) => (
              <li key={field}>{field}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          Die internen Vorbereitungsangaben sind vollstaendig.
        </p>
      )}

      {readiness.warnings.length > 0 ? (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600">
          {readiness.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export default async function DashboardPayoutProfilePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: profile }, { data: payoutProfile }, financialProfile] = await Promise.all([
    supabase.from("profiles").select("first_name,last_name,organization_name").eq("id", user.id).maybeSingle<ProfileRow>(),
    supabase
      .from("provider_payout_profiles")
      .select(
        "account_holder_name,address,payout_method,iban_last4,paypal_email,tax_number,vat_id,vat_status,verification_status,data_transfer_consent_accepted_at,legal_entity_type,business_type,representative_first_name,representative_last_name,representative_birth_date,representative_email,representative_phone,legal_address_line1,legal_address_line2,legal_postal_code,legal_city,legal_country,stripe_terms_accepted_at,business_profile_url,business_profile_mcc,business_profile_product_description"
      )
      .eq("teacher_id", user.id)
      .eq("provider", PROVIDER_PAYOUT_PROFILE_PROVIDER)
      .maybeSingle<ProviderPayoutProfileRow>(),
    getProviderBillingProfile(supabase, user.id),
  ]);

  const defaultAccountName =
    profile?.organization_name?.trim() || getProfileAccountName(profile ?? {}) || user.email || "";
  const currentMethod: ProviderPayoutMethod = payoutProfile?.payout_method === "paypal" ? "paypal" : "iban";
  const status = payoutProfile?.verification_status ?? "pending";
  const legalAddressFallback = splitAddressFallback(payoutProfile?.address);
  const readiness = getProviderCustomConnectReadiness(financialProfile);

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <Link href="/dashboard" className="inline-flex text-sm font-medium underline underline-offset-4">
        Zurueck zum Dashboard
      </Link>

      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Auszahlungsprofil</h1>
        <p className="text-sm text-muted-foreground">
          Hinterlege hier nur die bevorzugte Auszahlungsmethode fuer spaetere Payment-V2-Payouts.
        </p>
      </header>

      <section className="rounded-2xl border p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Status</p>
            <p className="mt-2 text-sm font-medium">{status}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Aktuelle Methode</p>
            <p className="mt-2 text-sm font-medium">{formatPayoutDestination(payoutProfile ?? null)}</p>
          </div>
        </div>
      </section>

      <CustomConnectReadinessCard readiness={readiness} />

      <div className="rounded-2xl border p-6">
        <PayoutProfileForm
          initialValues={{
            account_holder_name: payoutProfile?.account_holder_name ?? defaultAccountName,
            address: payoutProfile?.address ?? "",
            payout_method: currentMethod,
            iban_last4: payoutProfile?.iban_last4 ?? "",
            paypal_email: payoutProfile?.paypal_email ?? "",
            tax_number: payoutProfile?.tax_number ?? "",
            vat_id: payoutProfile?.vat_id ?? "",
            vat_status: payoutProfile?.vat_status ?? "",
            legal_entity_type: payoutProfile?.legal_entity_type ?? "",
            business_type: payoutProfile?.business_type ?? "",
            representative_first_name: payoutProfile?.representative_first_name ?? "",
            representative_last_name: payoutProfile?.representative_last_name ?? "",
            representative_birth_date: payoutProfile?.representative_birth_date ?? "",
            representative_email: payoutProfile?.representative_email ?? user.email ?? "",
            representative_phone: payoutProfile?.representative_phone ?? "",
            legal_address_line1: payoutProfile?.legal_address_line1 ?? legalAddressFallback.line1,
            legal_address_line2: payoutProfile?.legal_address_line2 ?? legalAddressFallback.line2,
            legal_postal_code: payoutProfile?.legal_postal_code ?? legalAddressFallback.postalCode,
            legal_city: payoutProfile?.legal_city ?? legalAddressFallback.city,
            legal_country: payoutProfile?.legal_country ?? legalAddressFallback.country,
            stripeTermsAccepted: Boolean(payoutProfile?.stripe_terms_accepted_at),
            business_profile_url: payoutProfile?.business_profile_url ?? "",
            business_profile_mcc: payoutProfile?.business_profile_mcc ?? "",
            business_profile_product_description: payoutProfile?.business_profile_product_description ?? "",
            consentAccepted: Boolean(payoutProfile?.data_transfer_consent_accepted_at),
            verification_status: status,
          }}
        />
      </div>
    </main>
  );
}
