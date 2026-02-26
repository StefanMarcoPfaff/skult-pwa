import Link from "next/link";
import CourseForm from "./CourseForm";

export default function CourseFormShell() {
  return (
    <div className="rounded-2xl border p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Kurs anlegen</h2>
          <p className="text-sm text-muted-foreground">
            Wiederkehrendes Angebot mit Wochentag, Uhrzeit und Rhythmus. Der erste Termin
            wird automatisch berechnet.
          </p>
        </div>
        <Link
          href="/dashboard/courses/new"
          className="text-sm underline underline-offset-4"
        >
          Zurück
        </Link>
      </div>

      <CourseForm />
    </div>
  );
}
