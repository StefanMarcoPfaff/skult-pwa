import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";

async function createCourse(formData: FormData) {
  "use server";

  const supabase = await createClient();

  const title = String(formData.get("title") || "").trim();
  const subtitle = String(formData.get("subtitle") || "").trim() || null;
  const location = String(formData.get("location") || "").trim() || null;
  const capacityRaw = formData.get("capacity");
  const capacity = Math.max(1, Number(capacityRaw || 10));

  if (!title) throw new Error("Titel ist erforderlich");

  const { error } = await supabase.from("courses_lite").insert({
    title,
    subtitle,
    location,
    capacity,
    seats_taken: 0,
  });

  if (error) throw new Error(error.message);

  redirect("/courses");
}

export default function NewCoursePage() {
  return (
    <main className="mx-auto max-w-md p-4 space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Kurs anlegen</h1>
        <Link href="/courses" className="text-sm text-gray-600">
          Zurück
        </Link>
      </header>

      <form action={createCourse} className="space-y-3">
        <label className="block">
          <span className="text-sm font-medium">Titel*</span>
          <input
            name="title"
            required
            placeholder="z. B. Impro Basics"
            className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium">Untertitel</span>
          <input
            name="subtitle"
            placeholder="z. B. Locker werden & spielen"
            className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium">Ort</span>
          <input
            name="location"
            placeholder="z. B. Berlin-Mitte oder Online"
            className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium">Kapazität</span>
          <input
            name="capacity"
            type="number"
            min={1}
            defaultValue={10}
            className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2"
          />
        </label>

        <button className="w-full rounded-xl bg-black text-white py-2 font-semibold active:scale-[0.99]">
          Speichern
        </button>
      </form>

      <p className="text-xs text-gray-500">
        Hinweis: Speichert direkt in Supabase (courses_lite).
      </p>
    </main>
  );
}
