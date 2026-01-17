import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { reserveSeat } from "./actions";

type Row = {
  id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  location: string | null;
  starts_at: string | null;
  ends_at: string | null;
  capacity: number;
  seats_taken: number;
};

function fmtDateRange(starts_at: string | null, ends_at: string | null) {
  if (!starts_at) return null;

  const s = new Date(starts_at);
  const e = ends_at ? new Date(ends_at) : null;

  const date = s.toLocaleDateString("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
  const startTime = s.toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const endTime = e
    ? e.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })
    : null;

  return endTime ? `${date}, ${startTime}–${endTime}` : `${date}, ${startTime}`;
}

export default async function CourseDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("courses_lite")
    .select(
      "id,title,subtitle,description,location,starts_at,ends_at,capacity,seats_taken"
    )
    .eq("id", id)
    .single();

  if (error || !data) return notFound();

  const course = data as Row;
  const free = course.capacity - course.seats_taken;

  const badge =
    free <= 0
      ? "bg-red-100 text-red-700"
      : free <= 3
      ? "bg-orange-100 text-orange-700"
      : "bg-emerald-100 text-emerald-700";

  const dateLine = fmtDateRange(course.starts_at, course.ends_at);

  return (
    <main className="mx-auto max-w-md p-4 space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{course.title}</h1>
        <Link href="/courses" className="text-sm text-gray-600">
          Zurück
        </Link>
      </header>

      {course.subtitle && <p className="text-sm text-gray-600">{course.subtitle}</p>}

      <div className="rounded-2xl border border-gray-200 p-4 space-y-2">
        {dateLine && <div className="text-sm text-gray-800">{dateLine}</div>}
        {course.location && <div className="text-sm text-gray-600">{course.location}</div>}

        <span className={`text-xs rounded-full px-2 py-0.5 inline-block ${badge}`}>
          {free <= 0 ? "Ausgebucht" : `${free} frei`}
        </span>
      </div>

      {course.description && (
        <p className="text-sm leading-6 text-gray-800 whitespace-pre-wrap">
          {course.description}
        </p>
      )}

      <form
        action={async () => {
          "use server";
          await reserveSeat(id);
        }}
      >
        <button
          disabled={free <= 0}
          className={`w-full rounded-xl py-2 font-semibold active:scale-[0.99] ${
            free <= 0 ? "bg-gray-200 text-gray-500" : "bg-black text-white"
          }`}
        >
          {free <= 0 ? "Ausgebucht" : "Platz reservieren"}
        </button>
      </form>

      <p className="text-xs text-gray-500">Quelle: Supabase (courses_lite)</p>
    </main>
  );
}
