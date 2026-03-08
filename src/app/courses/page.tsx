import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Row = Record<string, unknown>;

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatDateTime(dt: string | null) {
  if (!dt) return "";
  return new Date(dt).toLocaleString("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function getKind(row: Row): "workshop" | "course" | null {
  const raw = (asString(row.offer_type) ?? asString(row.kind) ?? "").toLowerCase();
  if (raw === "workshop" || raw === "course") return raw;
  return null;
}

function formatPrice(row: Row): string | null {
  const priceType = (asString(row.price_type) ?? "").toLowerCase();
  const currency = asString(row.currency) ?? "EUR";
  const cents = asNumber(row.price_cents);

  if (priceType === "free") return "Kostenlos";
  if (cents !== null && cents >= 0) {
    return new Intl.NumberFormat("de-DE", { style: "currency", currency }).format(cents / 100);
  }
  return null;
}

const weekdayLabels: Record<number, string> = {
  0: "Sonntag",
  1: "Montag",
  2: "Dienstag",
  3: "Mittwoch",
  4: "Donnerstag",
  5: "Freitag",
  6: "Samstag",
};

function formatCourseSchedule(row: Row): string | null {
  const weekday = asNumber(row.weekday);
  const startTime = asString(row.start_time);
  const recurrence = (asString(row.recurrence_type) ?? "").toLowerCase();
  const recurrenceLabel =
    recurrence === "weekly"
      ? "woechentlich"
      : recurrence === "biweekly"
      ? "14-taegig"
      : recurrence === "monthly"
      ? "monatlich"
      : asString(row.recurrence_type);
  const weekdayLabel = weekday !== null && weekdayLabels[weekday] ? weekdayLabels[weekday] : null;

  const parts = [weekdayLabel, startTime, recurrenceLabel].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

export default async function CoursesPage() {
  const supabase = await createSupabaseServerClient();

  let publishedFilterApplied = true;
  let response = await supabase
    .from("courses_lite")
    .select("*")
    .eq("is_published", true)
    .order("created_at", { ascending: false })
    .limit(50);

  if (response.error) {
    response = await supabase
      .from("courses_lite")
      .select("*")
      .eq("is_published", true)
      .order("starts_at", { ascending: true, nullsFirst: false })
      .limit(50);
  }

  if (response.error) {
    publishedFilterApplied = false;
    response = await supabase
      .from("courses_lite")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
  }

  if (response.error) {
    response = await supabase
      .from("courses_lite")
      .select("*")
      .order("starts_at", { ascending: true, nullsFirst: false })
      .limit(50);
  }

  if (response.error) {
    return (
      <main className="mx-auto max-w-md space-y-2 p-4">
        <h1 className="text-3xl font-black">Angebote</h1>
        <p className="text-sm text-red-600">Fehler: {response.error.message}</p>
        <p className="text-xs text-gray-500">
          Tipp: Existiert die View/Tabelle <code>courses_lite</code> wirklich so? Und ist RLS passend konfiguriert?
        </p>
      </main>
    );
  }

  let offers = (response.data ?? []) as Row[];
  if (!publishedFilterApplied) {
    const canClientFilter = offers.some((o) => typeof o.is_published === "boolean");
    if (canClientFilter) {
      offers = offers.filter((o) => o.is_published === true);
      publishedFilterApplied = true;
    }
  }

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-3xl font-black">Angebote</h1>

        <Link href="/login" className="text-sm font-semibold underline">
          Dozent*innen-Login
        </Link>
      </header>

      {offers.length === 0 ? (
        <p className="text-sm text-gray-600">Aktuell keine öffentlichen Angebote.</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {offers.map((o) => {
            const id = asString(o.id) ?? "";
            const title = asString(o.title) ?? "Ohne Titel";
            const subtitle = asString(o.subtitle);
            const location = asString(o.location);
            const startsAt = asString(o.starts_at);
            const capacity = asNumber(o.capacity);
            const taken = asNumber(o.seats_taken) ?? 0;
            const free = capacity === null ? null : Math.max(0, capacity - taken);
            const kind = getKind(o);
            const price = formatPrice(o);
            const courseSchedule = kind === "course" ? formatCourseSchedule(o) : null;
            const workshopTimeHint = kind === "workshop" ? formatDateTime(startsAt) : null;

            const kindLabel = kind === "course" ? "Kurs" : kind === "workshop" ? "Workshop" : null;

            const badge =
              free === null
                ? "bg-gray-100 text-gray-700"
                : free <= 0
                ? "bg-red-100 text-red-700"
                : free <= 3
                ? "bg-orange-100 text-orange-700"
                : "bg-emerald-100 text-emerald-700";

            const badgeText = free === null ? "offen" : free <= 0 ? "Ausgebucht" : `${free} frei`;

            return (
              <li key={id}>
                <Link href={`/courses/${id}`} className="block rounded-2xl border border-gray-200 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-base font-semibold">
                      {title}
                      {kindLabel ? <span className="font-medium text-gray-400"> · {kindLabel}</span> : null}
                    </h2>

                    <span className={`rounded-full px-2 py-0.5 text-xs ${badge}`}>{badgeText}</span>
                  </div>

                  <p className="mt-1 text-sm text-gray-600">
                    {location ?? "—"}
                    {price ? ` · ${price}` : ""}
                    {capacity !== null ? ` · Plätze: ${capacity}` : ""}
                  </p>

                  {kind === "workshop" && workshopTimeHint ? (
                    <p className="mt-2 text-sm text-gray-700">Termin: {workshopTimeHint}</p>
                  ) : null}

                  {kind === "course" && courseSchedule ? (
                    <p className="mt-2 text-sm text-gray-700">{courseSchedule}</p>
                  ) : null}

                  {subtitle ? <p className="mt-2 text-sm text-gray-700">{subtitle}</p> : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <footer className="pt-2 text-xs text-gray-500">
        Quelle: Supabase (courses_lite)
        {publishedFilterApplied ? "" : " · Hinweis: is_published in courses_lite nicht verfügbar"}
      </footer>
    </main>
  );
}
