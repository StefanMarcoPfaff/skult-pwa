import KindPicker from "./_components/KindPicker";
import WorkshopFormShell from "./_components/WorkshopFormShell";
import CourseFormShell from "./_components/CourseFormShell";

type CourseKind = "workshop" | "course";

function isCourseKind(value: unknown): value is CourseKind {
  return value === "workshop" || value === "course";
}

export default async function NewCoursePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const kindParam = Array.isArray(sp.kind) ? sp.kind[0] : sp.kind;
  const kind: CourseKind | null = isCourseKind(kindParam) ? kindParam : null;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Neuen Kurs/Workshop anlegen</h1>
        <p className="text-sm text-muted-foreground">
          Schritt 1: Wähle, ob du einen Workshop (einmalig) oder einen Kurs
          (wiederkehrend) erstellst.
        </p>
      </header>

      {!kind && <KindPicker />}
      {kind === "workshop" && <WorkshopFormShell />}
      {kind === "course" && <CourseFormShell />}
    </div>
  );
}
