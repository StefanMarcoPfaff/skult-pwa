import Link from "next/link";
import { getStripe } from "@/lib/stripe";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export default async function TrialRegistrationSuccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ session_id?: string; intentId?: string }>;
}) {
  const { token } = await params;
  const { session_id, intentId } = await searchParams;
  const admin = createSupabaseAdmin();

  if (session_id && intentId) {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ["subscription"],
    });

    if (
      session.metadata?.registrationIntentId === intentId &&
      (session.status === "complete" || session.payment_status === "paid")
    ) {
      await admin
        .from("course_registration_intents")
        .update({
          status: "checkout_completed",
          completed_at: new Date().toISOString(),
          stripe_checkout_session_id: session.id,
          stripe_customer_id: typeof session.customer === "string" ? session.customer : null,
          stripe_subscription_id:
            typeof session.subscription === "string"
              ? session.subscription
              : session.subscription?.id ?? null,
        })
        .eq("id", intentId);
    }
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <section className="rounded-2xl border p-6">
        <h1 className="text-2xl font-semibold">Anmeldung erfolgreich gestartet</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Deine verbindliche Kursanmeldung wurde gespeichert und die Zahlung war erfolgreich.
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          Die finale Umstellung des Probestatus auf vollstaendig konvertiert folgt im naechsten Schritt.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/courses" className="inline-flex rounded-xl border px-4 py-2 text-sm font-semibold">
            Zu den Kursen
          </Link>
          <Link href={`/trial/register/${token}`} className="inline-flex rounded-xl border px-4 py-2 text-sm font-semibold">
            Anmeldedaten ansehen
          </Link>
        </div>
      </section>
    </main>
  );
}
