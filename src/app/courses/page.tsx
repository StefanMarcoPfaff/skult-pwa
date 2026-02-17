import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Row = {
  id: string;
  title: string;
  subtitle: string | null;
  location: string | null;
  starts_at: string | null;
  capacity: number | null;
  seats_taken: number | null;
  kind: string | null; // "workshop" | "course" (oder null)
};

function formatDateTime(dt: string | null) {
  if (!dt) return "";
  const d = new Date(dt);
  const date = d.toLocaleDateString("de-DE");
  const time = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  return `${date}, ${time}`;
}

export default async function CoursesPage() {
  const supabase = await createSupabaseServerClient();

  // ✅ Kundenansicht: aus courses_lite (ohne is_public!)
  const { data, error } = await supabase
    .from("courses_lite")
    .select("id,title,subtitle,location,starts_at,capacity,seats_taken,kind")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return (
      <main className="mx-auto max-w-md p-4 space-y-2">
        <h1 className="text-3xl font-black">Angebote</h1>
        <p className="text-sm text-red-600">Fehler: {error.message}</p>
        <p className="text-xs text-gray-500">
          Tipp: Existiert die View/Tabelle <code>courses_lite</code> wirklich so? Und ist RLS passend konfiguriert?
        </p>
      </main>
    );
  }

  const offers = (data ?? []) as Row[];

  return (
    <main className="mx-auto max-w-md p-4 space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-3xl font-black">Angebote</h1>

        <Link href="/login" className="text-sm font-semibold underline">
          Dozent*innen-Login
        </Link>
      </header>

      {offers.length === 0 ? (
        <p className="text-sm text-gray-600">Aktuell keine öffentlichen Angebote.</p>
      ) : (
        <ul className="grid gap-3">
          {offers.map((o) => {
            const capacity = typeof o.capacity === "number" ? o.capacity : null;
            const taken = typeof o.seats_taken === "number" ? o.seats_taken : 0;
            const free = capacity === null ? null : Math.max(0, capacity - taken);

            const kindLabel =
              (o.kind ?? "").toLowerCase() === "course"
                ? "Kurs"
                : (o.kind ?? "").toLowerCase() === "workshop"
                ? "Workshop"
                : null;

            const badge =
              free === null
                ? "bg-gray-100 text-gray-700"
                : free <= 0
                ? "bg-red-100 text-red-700"
                : free <= 3
                ? "bg-orange-100 text-orange-700"
                : "bg-emerald-100 text-emerald-700";

            const badgeText =
              free === null ? "offen" : free <= 0 ? "Ausgebucht" : `${free} frei`;

            return (
              <li key={o.id}>
                <Link
                  href={`/courses/${o.id}`}
                  className="block rounded-2xl border border-gray-200 p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-base font-semibold">
                      {o.title}
                      {kindLabel ? (
                        <span className="text-gray-400 font-medium"> · {kindLabel}</span>
                      ) : null}
                    </h2>

                    <span className={`text-xs rounded-full px-2 py-0.5 ${badge}`}>
                      {badgeText}
                    </span>
                  </div>

                  <p className="text-sm text-gray-600 mt-1">
                    {o.location ? o.location : "—"}
                    {o.starts_at ? ` · ${formatDateTime(o.starts_at)}` : ""}
                    {capacity !== null ? ` · Plätze: ${capacity}` : ""}
                  </p>

                  {o.subtitle ? (
                    <p className="text-sm text-gray-700 mt-2">{o.subtitle}</p>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <footer className="pt-2 text-xs text-gray-500">
        Quelle: Supabase (courses_lite)
      </footer>
    </main>
  );
}
