// src/app/courses/[id]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import ReserveButton from "./ReserveButton";
import { reserveSeat, cancelSeat } from "./actions";

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

function formatDateRange(startsAt: string | null, endsAt: string | null) {
  if (!startsAt) return "";
  const s = new Date(startsAt);
  const e = endsAt ? new Date(endsAt) : null;

  const date = s.toLocaleDateString("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });

  const startTime = s.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  const endTime = e ? e.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) : "";

  return endTime ? `${date}, ${startTime}–${endTime}` : `${date}, ${startTime}`;
}

export default async function CourseDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Next.js 16: params ist ein Promise → erst awaiten
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

  const free = Math.max(0, (course.capacity ?? 0) - (course.seats_taken ?? 0));

  const badge =
    free === 0
      ? "bg-red-100 text-red-700"
      : free <= 3
      ? "bg-orange-100 text-orange-700"
      : "bg-emerald-100 text-emerald-700";

  const dateText = formatDateRange(course.starts_at, course.ends_at);

  return (
    <main className="mx-auto max-w-md p-4 space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{course.title}</h1>
        <Link href="/courses" className="text-sm text-gray-600">
          Zurück
        </Link>
      </header>

      {course.subtitle && (
        <p className="text-sm text-gray-600">{course.subtitle}</p>
      )}

      <div className="rounded-2xl border border-gray-200 p-4 space-y-2">
        {dateText && <div className="text-sm text-gray-800">{dateText}</div>}
        {course.location && (
          <div className="text-sm text-gray-600">{course.location}</div>
        )}

        <span className={`text-xs rounded-full px-2 py-0.5 inline-block ${badge}`}>
          {free === 0 ? "Ausgebucht" : `${free} frei`}
        </span>
      </div>

      {course.description && (
        <p className="text-sm leading-6 text-gray-800">{course.description}</p>
      )}

      {/* ✅ HIER sitzt jetzt dein Reservieren-/Stornieren-Block */}
      <ReserveButton
        courseId={id}
        disabled={free <= 0}
        reserveAction={reserveSeat}
        cancelAction={cancelSeat}
      />
    </main>
  );
}
