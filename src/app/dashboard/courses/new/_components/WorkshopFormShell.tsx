import Link from "next/link";
import { redirect } from "next/navigation";
import { getProviderDisplayName, type ProviderType } from "@/lib/provider-profiles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import WorkshopForm from "./WorkshopForm";

type ProfileRow = {
  first_name: string | null;
  last_name: string | null;
  provider_type: ProviderType | null;
  organization_name: string | null;
};

export default async function WorkshopFormShell() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name,last_name,provider_type,organization_name")
    .eq("id", user.id)
    .maybeSingle<ProfileRow>();

  const providerType = profile?.provider_type ?? "independent_teacher";
  const providerDisplayName = getProviderDisplayName(providerType, {
    first_name: profile?.first_name,
    last_name: profile?.last_name,
    organization_name: profile?.organization_name,
  });

  return (
    <div className="space-y-4 rounded-2xl border p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Einmaliges Angebot anlegen</h2>
          <p className="text-sm text-muted-foreground">
            Für einmalige oder zeitlich begrenzte Angebote. Öffentlich sichtbar oder nur per Link
            buchbar.
          </p>
        </div>
        <Link href="/dashboard/courses/new" className="text-sm underline underline-offset-4">
          Zurück
        </Link>
      </div>

      <WorkshopForm providerType={providerType} providerDisplayName={providerDisplayName} />
    </div>
  );
}
