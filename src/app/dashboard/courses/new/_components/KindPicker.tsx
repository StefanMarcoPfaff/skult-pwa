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
        <div className="text-lg font-semibold">Workshop</div>
        <div className="mt-1 text-sm text-muted-foreground">
          Einmalige Veranstaltung mit Startdatum/-zeit. Direkt buchbar.
        </div>
      </button>

      <button
        type="button"
        onClick={() => router.push("/dashboard/courses/new?kind=course")}
        className="rounded-2xl border p-5 text-left shadow-sm transition hover:shadow"
      >
        <div className="text-lg font-semibold">Kurs</div>
        <div className="mt-1 text-sm text-muted-foreground">
          Wiederkehrend (wöchentlich/14-tägig/monatlich) mit Probestunde + Mailflow.
        </div>
      </button>
    </div>
  );
}
