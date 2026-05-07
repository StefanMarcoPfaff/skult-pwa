import Link from "next/link";
import { redirect } from "next/navigation";
import { calculateCoursePriceBreakdown } from "@/lib/course-pricing";
import type { ProviderType } from "@/lib/provider-profiles";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getDisplayStatus, type DashboardOfferView } from "../courses/display-status";

type CourseRow = {
  id: string;
  title: string;
  kind: string | null;
  status: string | null;
  is_published: boolean | null;
  starts_at: string | null;
  ends_at: string | null;
  price_cents: number | null;
  currency: string | null;
};

type ProfileRow = {
  provider_type: ProviderType | null;
};

type RegistrationIntentRow = {
  id: string;
  course_id: string;
  status: string | null;
  completed_at: string | null;
  stripe_subscription_id: string | null;
};

type BookingRow = {
  id: string;
  course_id: string | null;
  status: string | null;
  created_at: string | null;
  refunded_at: string | null;
  stripe_refund_id: string | null;
};

type RevenueLine = {
  id: string;
  courseId: string;
  offerTitle: string;
  kindLabel: string;
  recognizedAt: string;
  sourceLabel: string;
  grossCents: number;
  feeCents: number;
  payoutCents: number;
};

function formatCurrency(valueCents: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(valueCents / 100);
}

function formatMonthLabel(value: string): string {
  const [year, month] = value.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString("de-DE", { month: "long", year: "numeric" });
}

function getView(value: string | string[] | undefined): DashboardOfferView {
  const selected = Array.isArray(value) ? value[0] : value;
  if (selected === "active" || selected === "archive") return selected;
  return "all";
}

function buildViewHref(view: DashboardOfferView) {
  return view === "all" ? "/dashboard/revenue" : `/dashboard/revenue?view=${view}`;
}

export default async function DashboardRevenuePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const selectedView = getView(sp.view);

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const admin = createSupabaseAdmin();
  const [{ data: profile }, { data: courses }] = await Promise.all([
    admin.from("profiles").select("provider_type").eq("id", user.id).maybeSingle<ProfileRow>(),
    admin
      .from("courses")
      .select("id,title,kind,status,is_published,starts_at,ends_at,price_cents,currency")
      .eq("teacher_id", user.id)
      .returns<CourseRow[]>(),
  ]);

  const offerRows = courses ?? [];
  const offerIds = offerRows.map((course) => course.id);
  const courseById = new Map(offerRows.map((course) => [course.id, course]));
  const providerType = profile?.provider_type ?? null;

  const [{ data: intents }, { data: bookings }] = offerIds.length
    ? await Promise.all([
        admin
          .from("course_registration_intents")
          .select("id,course_id,status,completed_at,stripe_subscription_id")
          .in("course_id", offerIds)
          .returns<RegistrationIntentRow[]>(),
        admin
          .from("bookings")
          .select("id,course_id,status,created_at,refunded_at,stripe_refund_id")
          .in("course_id", offerIds)
          .returns<BookingRow[]>(),
      ])
    : [{ data: [] as RegistrationIntentRow[] }, { data: [] as BookingRow[] }];

  const offerViewById = new Map(
    offerRows.map((course) => [
      course.id,
      getDisplayStatus({
        kind: course.kind,
        status: (course.status ?? null) as never,
        isPublished: course.is_published,
        endsAt: course.ends_at,
        startsAt: course.starts_at,
      }).view,
    ])
  );

  const relevantOfferIds = offerRows
    .filter((course) => {
      const view = offerViewById.get(course.id) ?? "active";
      if (selectedView === "all") return true;
      return view === selectedView;
    })
    .map((course) => course.id);
  const relevantOfferSet = new Set(relevantOfferIds);

  const revenueLines: RevenueLine[] = [];

  for (const intent of intents ?? []) {
    if (intent.status !== "checkout_completed" || !intent.completed_at || !intent.stripe_subscription_id) continue;
    if (!relevantOfferSet.has(intent.course_id)) continue;

    const course = courseById.get(intent.course_id);
    if (!course?.price_cents) continue;

    const price = calculateCoursePriceBreakdown(course.price_cents, providerType);
    revenueLines.push({
      id: `subscription-${intent.id}`,
      courseId: course.id,
      offerTitle: course.title,
      kindLabel: "laufendes Angebot",
      recognizedAt: intent.completed_at,
      sourceLabel: "Erstanmeldung",
      grossCents: price.grossCents,
      feeCents: price.platformFeeCents,
      payoutCents: price.payoutCents,
    });
  }

  for (const booking of bookings ?? []) {
    if (!booking.course_id || booking.status !== "paid" || !booking.created_at) continue;
    if (booking.refunded_at || booking.stripe_refund_id) continue;
    if (!relevantOfferSet.has(booking.course_id)) continue;

    const course = courseById.get(booking.course_id);
    if (!course?.price_cents) continue;

    const price = calculateCoursePriceBreakdown(course.price_cents, providerType);
    revenueLines.push({
      id: `booking-${booking.id}`,
      courseId: course.id,
      offerTitle: course.title,
      kindLabel: "einmaliges Angebot",
      recognizedAt: booking.created_at,
      sourceLabel: "Bezahlte Buchung",
      grossCents: price.grossCents,
      feeCents: price.platformFeeCents,
      payoutCents: price.payoutCents,
    });
  }

  revenueLines.sort((left, right) => right.recognizedAt.localeCompare(left.recognizedAt));

  const currentMonth = new Date().toISOString().slice(0, 7);
  const monthGroups = new Map<string, { grossCents: number; feeCents: number; payoutCents: number }>();
  const offerGroups = new Map<
    string,
    { title: string; kindLabel: string; grossCents: number; feeCents: number; payoutCents: number; count: number }
  >();

  let currentMonthPayoutCents = 0;
  let totalPayoutCents = 0;

  for (const line of revenueLines) {
    const monthKey = line.recognizedAt.slice(0, 7);
    const monthEntry = monthGroups.get(monthKey) ?? { grossCents: 0, feeCents: 0, payoutCents: 0 };
    monthEntry.grossCents += line.grossCents;
    monthEntry.feeCents += line.feeCents;
    monthEntry.payoutCents += line.payoutCents;
    monthGroups.set(monthKey, monthEntry);

    const offerEntry = offerGroups.get(line.courseId) ?? {
      title: line.offerTitle,
      kindLabel: line.kindLabel,
      grossCents: 0,
      feeCents: 0,
      payoutCents: 0,
      count: 0,
    };
    offerEntry.grossCents += line.grossCents;
    offerEntry.feeCents += line.feeCents;
    offerEntry.payoutCents += line.payoutCents;
    offerEntry.count += 1;
    offerGroups.set(line.courseId, offerEntry);

    totalPayoutCents += line.payoutCents;
    if (monthKey === currentMonth) currentMonthPayoutCents += line.payoutCents;
  }

  const months = [...monthGroups.entries()].sort((left, right) => right[0].localeCompare(left[0]));
  const offers = [...offerGroups.entries()].sort((left, right) => right[1].payoutCents - left[1].payoutCents);

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <Link href="/dashboard" className="inline-flex text-sm font-semibold">
        Zurück zum Dashboard
      </Link>

      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Einnahmen</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Übersicht über erfasste Umsätze pro Angebot und Monat. Netto bedeutet hier aktuell:
          Brutto minus RESER-Plattformgebühr auf Basis der im System gespeicherten Preise für laufende und einmalige Angebote.
        </p>
      </header>

      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-semibold">Datenstand</p>
        <p className="mt-1">
          Wiederkehrende Stripe-Folgebuchungen, Stripe-Gebühren, Transfer-Auszahlungen und Payout-Timing werden
          aktuell noch nicht vollständig persistiert. Die Netto-Werte bilden deshalb bestätigte Erstzahlungen und
          bezahlte Buchungen ab.
        </p>
      </div>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border p-4">
          <p className="text-sm text-muted-foreground">Einnahmen gesamt</p>
          <p className="mt-1 text-2xl font-semibold">{formatCurrency(totalPayoutCents)}</p>
        </div>
        <div className="rounded-2xl border p-4">
          <p className="text-sm text-muted-foreground">Einnahmen diesen Monat</p>
          <p className="mt-1 text-2xl font-semibold">{formatCurrency(currentMonthPayoutCents)}</p>
        </div>
        <div className="rounded-2xl border p-4">
          <p className="text-sm text-muted-foreground">Erfasste Zahlungen</p>
          <p className="mt-1 text-2xl font-semibold">{revenueLines.length}</p>
        </div>
      </section>

      <nav className="flex flex-wrap gap-2" aria-label="Revenue-Filter">
        {[
          { id: "all" as const, label: "Alle Angebote" },
          { id: "active" as const, label: "Aktive Angebote" },
          { id: "archive" as const, label: "Vergangene Angebote" },
        ].map((tab) => {
          const selected = selectedView === tab.id;
          return (
            <Link
              key={tab.id}
              href={buildViewHref(tab.id)}
              aria-current={selected ? "page" : undefined}
              className={`inline-flex rounded-full border px-4 py-2 text-sm font-medium transition ${
                selected ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 hover:bg-slate-50"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-3xl border p-5">
          <h2 className="text-xl font-semibold">Einnahmen pro Angebot</h2>
          <div className="mt-4 space-y-3">
            {offers.length === 0 ? (
              <p className="text-sm text-muted-foreground">Für den aktuellen Filter wurden noch keine Einnahmen erfasst.</p>
            ) : (
              offers.map(([courseId, offer]) => (
                <article key={courseId} className="rounded-2xl border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">{offer.title}</h3>
                      <p className="text-sm text-muted-foreground">
                        {offer.kindLabel} | {offer.count} Zahlung{offer.count === 1 ? "" : "en"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Netto</p>
                      <p className="text-lg font-semibold">{formatCurrency(offer.payoutCents)}</p>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-3">
                    <p>Brutto: <span className="font-medium text-foreground">{formatCurrency(offer.grossCents)}</span></p>
                    <p>Plattformgebühr: <span className="font-medium text-foreground">{formatCurrency(offer.feeCents)}</span></p>
                    <p>Angebot: <Link href={`/dashboard/courses/${courseId}`} className="font-medium text-foreground underline underline-offset-4">Öffnen</Link></p>
                  </div>
                </article>
              ))
            )}
          </div>
        </div>

        <div className="space-y-6">
          <section className="rounded-3xl border p-5">
            <h2 className="text-xl font-semibold">Einnahmen pro Monat</h2>
            <div className="mt-4 space-y-3">
              {months.length === 0 ? (
                <p className="text-sm text-muted-foreground">Noch keine Monatswerte vorhanden.</p>
              ) : (
                months.map(([monthKey, entry]) => (
                  <div key={monthKey} className="flex items-center justify-between rounded-2xl border p-4">
                    <div>
                      <p className="font-semibold">{formatMonthLabel(monthKey)}</p>
                      <p className="text-sm text-muted-foreground">
                        Brutto {formatCurrency(entry.grossCents)} | Gebühr {formatCurrency(entry.feeCents)}
                      </p>
                    </div>
                    <p className="text-lg font-semibold">{formatCurrency(entry.payoutCents)}</p>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="rounded-3xl border p-5">
            <h2 className="text-xl font-semibold">Zuletzt erfasst</h2>
            <div className="mt-4 space-y-3">
              {revenueLines.length === 0 ? (
                <p className="text-sm text-muted-foreground">Noch keine erfassten Zahlungen vorhanden.</p>
              ) : (
                revenueLines.slice(0, 8).map((line) => (
                  <div key={line.id} className="flex items-center justify-between gap-3 rounded-2xl border p-4">
                    <div>
                      <p className="font-semibold">{line.offerTitle}</p>
                      <p className="text-sm text-muted-foreground">
                        {line.kindLabel} | {line.sourceLabel} | {new Date(line.recognizedAt).toLocaleDateString("de-DE")}
                      </p>
                    </div>
                    <p className="font-semibold">{formatCurrency(line.payoutCents)}</p>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
