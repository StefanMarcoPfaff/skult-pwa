import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  maskEmail,
  maskIbanLast4,
  PROVIDER_PAYOUT_PROFILE_PROVIDER,
  type ProviderPayoutMethod,
} from "@/lib/payout-profile";
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
  verification_status: string | null;
  data_transfer_consent_accepted_at: string | null;
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

export default async function DashboardPayoutProfilePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: profile }, { data: payoutProfile }] = await Promise.all([
    supabase.from("profiles").select("first_name,last_name,organization_name").eq("id", user.id).maybeSingle<ProfileRow>(),
    supabase
      .from("provider_payout_profiles")
      .select(
        "account_holder_name,address,payout_method,iban_last4,paypal_email,tax_number,vat_id,verification_status,data_transfer_consent_accepted_at"
      )
      .eq("teacher_id", user.id)
      .eq("provider", PROVIDER_PAYOUT_PROFILE_PROVIDER)
      .maybeSingle<ProviderPayoutProfileRow>(),
  ]);

  const defaultAccountName =
    profile?.organization_name?.trim() || getProfileAccountName(profile ?? {}) || user.email || "";
  const currentMethod: ProviderPayoutMethod = payoutProfile?.payout_method === "paypal" ? "paypal" : "iban";
  const status = payoutProfile?.verification_status ?? "pending";

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
            consentAccepted: Boolean(payoutProfile?.data_transfer_consent_accepted_at),
            verification_status: status,
          }}
        />
      </div>
    </main>
  );
}
