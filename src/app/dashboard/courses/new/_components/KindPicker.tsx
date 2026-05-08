"use client";

import { useRouter } from "next/navigation";

export default function KindPicker() {
  const router = useRouter();

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <button
        type="button"
        onClick={() => router.push("/dashboard/courses/new?kind=workshop")}
        className="rounded-2xl border p-5 text-left shadow-sm transition hover:shadow"
      >
        <div className="text-lg font-semibold">Einmaliges Angebot</div>
        <div className="mt-1 text-sm text-muted-foreground">
          Für einmalige oder zeitlich begrenzte Angebote, z. B. zweitägiger Workshop, einstündiger
          Rundgang, Firmenführung, Einzelcoaching oder Wochenendangebot. Öffentlich sichtbar oder
          nur per Link buchbar.
        </div>
      </button>

      <button
        type="button"
        onClick={() => router.push("/dashboard/courses/new?kind=course")}
        className="rounded-2xl border p-5 text-left shadow-sm transition hover:shadow"
      >
        <div className="text-lg font-semibold">Laufendes Angebot</div>
        <div className="mt-1 text-sm text-muted-foreground">
          Für wiederkehrende Angebote, z. B. wöchentliche oder 14-tägige Kurse, regelmäßige
          Gruppen oder fortlaufende Termine mit Monatszahlung.
        </div>
      </button>
    </div>
  );
}
