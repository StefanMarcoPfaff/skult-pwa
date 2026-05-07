"use client";

import { useRouter } from "next/navigation";

export default function KindPicker() {
  const router = useRouter();

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <button
        type="button"
        onClick={() => router.push("/dashboard/courses/new?kind=workshop")}
        className="rounded-2xl border p-5 text-left shadow-sm transition hover:shadow"
      >
        <div className="text-lg font-semibold">Einmaliges Angebot</div>
        <div className="mt-1 text-sm text-muted-foreground">
          Einmalige Veranstaltung mit Termin und Direktbuchung.
        </div>
      </button>

      <button
        type="button"
        onClick={() => router.push("/dashboard/courses/new?kind=course")}
        className="rounded-2xl border p-5 text-left shadow-sm transition hover:shadow"
      >
        <div className="text-lg font-semibold">Laufendes Angebot</div>
        <div className="mt-1 text-sm text-muted-foreground">
          Wiederkehrend (wöchentlich/14-tägig/monatlich) mit Probestunde + Mailflow.
        </div>
      </button>

      <button
        type="button"
        onClick={() => router.push("/dashboard/courses/new?kind=exclusive_offer")}
        className="rounded-2xl border p-5 text-left shadow-sm transition hover:shadow"
      >
        <div className="text-lg font-semibold">Exklusiv-Angebot</div>
        <div className="mt-1 text-sm text-muted-foreground">
          Individuelles Einmalangebot, standardmäßig nur per Link sichtbar und buchbar.
        </div>
      </button>
    </div>
  );
}
