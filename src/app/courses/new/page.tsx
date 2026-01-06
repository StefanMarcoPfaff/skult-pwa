// src/app/courses/new/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewCoursePage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [date, setDate] = useState("");
  const [location, setLocation] = useState("");
  const [capacity, setCapacity] = useState(10);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Hier würden wir später an Supabase senden.
    console.log({ title, subtitle, date, location, capacity });
    alert("Kurs gespeichert (Demo) ✔️ – gleich speichern wir wirklich in Supabase.");
    router.push("/courses");
  }

  return (
    <main className="mx-auto max-w-md p-4 space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Kurs anlegen</h1>
        <button onClick={() => router.back()} className="text-sm text-gray-600">Abbrechen</button>
      </header>

      <form onSubmit={handleSubmit} className="space-y-3">
        <label className="block">
          <span className="text-sm font-medium">Titel*</span>
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2"
            placeholder="z. B. Impro Basics"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium">Untertitel</span>
          <input
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2"
            placeholder="kurzer Zusatz"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium">Datum/Zeit (frei)</span>
          <input
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2"
            placeholder="Mo, 19:00–21:00"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium">Ort</span>
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2"
            placeholder="Berlin-Mitte oder Online"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium">Kapazität</span>
          <input
            type="number"
            min={1}
            value={capacity}
            onChange={(e) => setCapacity(parseInt(e.target.value || "1", 10))}
            className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2"
          />
        </label>

        <button
          type="submit"
          className="w-full rounded-xl bg-black text-white py-2 font-semibold active:scale-[0.99]"
        >
          Speichern
        </button>
      </form>
    </main>
  );
}
