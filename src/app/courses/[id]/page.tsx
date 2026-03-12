import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PayButton } from "./PayButton";
import ReserveTrialButton from "./ReserveTrialButton";
import { computeUpcomingTrialSlots, type TrialSlot } from "./trial-slots";

type Row = Record<string, unknown>;
type SessionRow = {
  id: string;
  course_id: string;
  starts_at: string | null;
  ends_at: string | null;
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
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

function recurrenceLabel(value: string | null): string | null {
  if (!value) return null;
  const v = value.toLowerCase();
  if (v === "weekly") return "wöchentlich";
  if (v === "biweekly") return "14-tägig";
  if (v === "monthly") return "monatlich";
  return value;
}

function formatSessionLine(startsAt: string | null, endsAt: string | null): string {
  if (!startsAt) return "-";
  const start = new Date(startsAt);
  const date = start.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const startTime = start.toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const endTime = endsAt
    ? new Date(endsAt).toLocaleTimeString("de-DE", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "-";

  return `${date} | ${startTime}-${endTime}`;
}

export default async function CourseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ reserved?: string }>;
}) {
  const { id } = await params;
  const { reserved } = await searchParams;
  const supabase = await createSupabaseServerClient();

  let response = await supabase
    .from("courses_lite")
    .select("*")
    .eq("id", id)
    .eq("is_published", true)
    .maybeSingle<Row>();

  if (response.error) {
    response = await supabase.from("courses_lite").select("*").eq("id", id).maybeSingle<Row>();
  }

  if (response.error || !response.data) return notFound();

  const data = response.data;
  if (typeof data.is_published === "boolean" && !data.is_published) {
    return notFound();
  }

  const kind = getKind(data) ?? "workshop";
  const title = asString(data.title) ?? "Ohne Titel";
  const description = asString(data.description) ?? asString(data.subtitle);
  const location = asString(data.location);
  const price = formatPrice(data);

  const weekday = asNumber(data.weekday);
  const startTime = asString(data.start_time);
  const durationMinutes = asNumber(data.duration_minutes);
  const recurrenceRaw = asString(data.recurrence_type);
  const recurrence = recurrenceLabel(recurrenceRaw);
  const trialMode = (asString(data.trial_mode) ?? "all_sessions").toLowerCase();
  const startsAt = asString(data.starts_at);
  const capacity = asNumber(data.capacity);

  const trialSlots: TrialSlot[] =
    kind === "course" && trialMode === "all_sessions" && startsAt
      ? computeUpcomingTrialSlots({
          weekday,
          startTime,
          durationMinutes,
          recurrenceType: recurrenceRaw,
          trialMode,
          startsAt,
        })
      : [];

  if (process.env.NODE_ENV !== "production" && kind === "course") {
    console.log("[courses/[id]] recurrence fields", {
      id: asString(data.id),
      starts_at: startsAt,
      weekday,
      start_time: startTime,
      duration_minutes: durationMinutes,
      recurrence_type: recurrenceRaw,
      trial_mode: trialMode,
    });
    console.log("[courses/[id]] generated occurrences", {
      id: asString(data.id),
      count: trialSlots.length,
    });
  }

  let remainingPlaces: number | null = null;
  if (kind === "course" && capacity !== null) {
    const admin = createSupabaseAdmin();
    const { count } = await admin
      .from("trial_reservations")
      .select("id", { count: "exact", head: true })
      .eq("course_id", id);

    remainingPlaces = Math.max(0, capacity - (count ?? 0));
  }

  let sessions: SessionRow[] = [];
  if (kind === "workshop") {
    const { data: sessionData } = await supabase
      .from("course_sessions")
      .select("id,course_id,starts_at,ends_at")
      .eq("course_id", id)
      .order("starts_at", { ascending: true })
      .returns<SessionRow[]>();
    sessions = sessionData ?? [];
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <p>
        <Link href="/courses" className="text-sm font-semibold underline underline-offset-4">
          ← Zurück
        </Link>
      </p>

      <header className="space-y-2">
        <h1 className="text-3xl font-black">{title}</h1>
        <p className="text-sm text-muted-foreground">{kind === "workshop" ? "Workshop" : "Kurs"}</p>
      </header>

      <section className="rounded-2xl border p-4 text-sm text-muted-foreground">
        {location ? <p>Ort: {location}</p> : null}
        {price ? <p>Preis: {price}</p> : null}
        {kind === "course" && weekday !== null && weekdayLabels[weekday] ? (
          <p>Wochentag: {weekdayLabels[weekday]}</p>
        ) : null}
        {kind === "course" && startTime ? <p>Startzeit: {startTime}</p> : null}
        {kind === "course" && recurrence ? <p>Rhythmus: {recurrence}</p> : null}
      </section>

      {description ? <p className="leading-7">{description}</p> : null}

      {kind === "workshop" ? (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Termine</h2>
          <div className="rounded-2xl border p-4 text-sm text-muted-foreground">
            {sessions.length > 0 ? (
              <ul className="space-y-2">
                {sessions.map((session) => (
                  <li key={session.id}>{formatSessionLine(session.starts_at, session.ends_at)}</li>
                ))}
              </ul>
            ) : startsAt ? (
              <p>{formatSessionLine(startsAt, null)}</p>
            ) : (
              <p>Termine folgen in Kürze.</p>
            )}
          </div>

          <div className="space-y-2 rounded-2xl border p-4">
            <h3 className="text-base font-semibold">Jetzt buchen</h3>
            <PayButton courseId={id} />
          </div>
        </section>
      ) : (
        <section className="space-y-3 rounded-2xl border p-4">
          <h3 className="text-base font-semibold">Kostenlose Probestunde reservieren</h3>
          {remainingPlaces !== null && remainingPlaces > 0 && remainingPlaces <= 3 ? (
            <p className="text-sm font-medium text-amber-700">Nur noch {remainingPlaces} Plätze verfügbar</p>
          ) : null}
          {reserved === "1" ? (
            <p className="text-sm text-green-700">
              Herzlichen Glückwunsch! Du hast dich erfolgreich zur Probestunde angemeldet. Wir melden uns in Kürze mit allen weiteren Informationen bei dir.
            </p>
          ) : trialMode === "manual" ? (
            <p className="text-sm text-muted-foreground">
              Probestunden-Termine werden in Kürze verfügbar sein.
            </p>
          ) : trialSlots.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aktuell sind keine Probestunden-Termine verfügbar.
            </p>
          ) : (
            <ReserveTrialButton courseId={id} trialSlots={trialSlots} />
          )}
        </section>
      )}
    </main>
  );
}
