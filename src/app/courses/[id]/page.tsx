import Link from "next/link";
import { notFound } from "next/navigation";
import { findCourse } from "@/data/courses-demo";
import ReserveButton from "./ReserveButton";

export default async function CourseDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const course = findCourse(id);
  if (!course) return notFound();

  const free = course.free;
  const badge =
    free === 0
      ? "bg-red-100 text-red-700"
      : free <= 3
      ? "bg-orange-100 text-orange-700"
      : "bg-emerald-100 text-emerald-700";

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
        <div className="text-sm text-gray-800">{course.date}</div>
        <div className="text-sm text-gray-600">{course.location}</div>
        <span className={`text-xs rounded-full px-2 py-0.5 inline-block ${badge}`}>
          {free === 0 ? "Ausgebucht" : `${free} frei`}
        </span>
      </div>

      {course.description && (
        <p className="text-sm leading-6 text-gray-800">{course.description}</p>
      )}

      <ReserveButton disabled={free === 0} />
    </main>
  );
}
