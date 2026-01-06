import Link from "next/link";
import { createClient } from "@/lib/supabase-server";

type Row = {
  id: string;
  title: string;
  subtitle: string | null;
  location: string | null;
  capacity: number;
  seats_taken: number;
};

export default async function CoursesPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("courses_lite")
    .select("id,title,subtitle,location,capacity,seats_taken")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return (
      <main className="mx-auto max-w-md p-4 space-y-2">
        <h1 className="text-2xl font-bold">Kurse</h1>
        <p className="text-sm text-red-600">Fehler: {error.message}</p>
        <p className="text-xs text-gray-500">
          Tipp: Tabelle heißt wirklich <code>courses_lite</code>? RLS disabled?
        </p>
      </main>
    );
  }

  const courses = (data ?? []) as Row[];

  return (
    <main className="mx-auto max-w-md p-4 space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Kurse</h1>
        <Link
          href="/courses/new"
          className="rounded-xl px-3 py-2 text-sm font-semibold bg-black text-white"
        >
          Kurs anlegen
        </Link>
      </header>

      {courses.length === 0 ? (
        <p className="text-sm text-gray-600">Noch keine Kurse in Supabase.</p>
      ) : (
        <ul className="grid gap-3">
          {courses.map((c) => {
            const free = c.capacity - c.seats_taken;
            const badge =
              free <= 0
                ? "bg-red-100 text-red-700"
                : free <= 3
                ? "bg-orange-100 text-orange-700"
                : "bg-emerald-100 text-emerald-700";

            return (
              <li key={c.id}>
                <Link
                  href={`/courses/${c.id}`}
                  className="block rounded-2xl border border-gray-200 p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-base font-semibold">{c.title}</h2>
                    <span className={`text-xs rounded-full px-2 py-0.5 ${badge}`}>
                      {free <= 0 ? "Ausgebucht" : `${free} frei`}
                    </span>
                  </div>
                  {c.subtitle && (
                    <p className="text-sm text-gray-600 mt-0.5">{c.subtitle}</p>
                  )}
                  <div className="text-sm text-gray-600">{c.location}</div>
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
