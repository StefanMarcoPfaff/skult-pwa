import Link from "next/link";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export default async function TrialRegistrationCancelPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ intentId?: string }>;
}) {
  const { token } = await params;
  const { intentId } = await searchParams;

  if (intentId) {
    const admin = createSupabaseAdmin();
    await admin
      .from("course_registration_intents")
      .update({ status: "checkout_cancelled" })
      .eq("id", intentId)
      .neq("status", "checkout_completed");
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <section className="rounded-2xl border p-6">
        <h1 className="text-2xl font-semibold">Zahlung abgebrochen</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Kein Problem - deine Anmeldung ist gespeichert, aber die Zahlung wurde noch nicht abgeschlossen.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href={`/trial/register/${token}`} className="inline-flex rounded-xl border px-4 py-2 text-sm font-semibold">
            Zurueck zur Anmeldung
          </Link>
          <Link href="/courses" className="inline-flex rounded-xl border px-4 py-2 text-sm font-semibold">
            Zu den Kursen
          </Link>
        </div>
      </section>
    </main>
  );
}
