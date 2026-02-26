import Link from "next/link";
import WorkshopForm from "./WorkshopForm";

export default function WorkshopFormShell() {
  return (
    <div className="rounded-2xl border p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Workshop anlegen</h2>
          <p className="text-sm text-muted-foreground">
            Einmaliger Termin mit festem Startzeitpunkt, optionaler Kapazitaet und Preis.
          </p>
        </div>
        <Link
          href="/dashboard/courses/new"
          className="text-sm underline underline-offset-4"
        >
          Zurück
        </Link>
      </div>

      <WorkshopForm />
    </div>
  );
}
