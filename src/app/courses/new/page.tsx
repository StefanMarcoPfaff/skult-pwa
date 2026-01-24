// src/app/courses/new/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";

function toInt(value: FormDataEntryValue | null, fallback: number) {
  const n = Number(value ?? "");
  return Number.isFinite(n) ? n : fallback;
}

function toText(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

export default function NewCoursePage() {
  async function createCourse(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const title = toText(formData.get("title"));
    const subtitle = toText(formData.get("subtitle"));
    const location = toText(formData.get("location"));

    const capacity = toInt(formData.get("capacity"), 10);

    // neu: Unterscheidung Kurs/Workshop
    const offer_type = toText(formData.get("offer_type")) || "course"; // course | workshop
    const booking_mode = toText(formData.get("booking_mode")) || "approval"; // approval | direct | request
    const price_type = toText(formData.get("price_type")) || "free"; // free | paid
    const currency = toText(formData.get("currency")) || "EUR";

    const price_eur = toInt(formData.get("price_eur"), 0);
    const price_cents = price_type === "paid" ? Math.max(0, price_eur * 100) : 0;

    if (!title) {
      throw new Error("Titel fehlt");
    }
    if (!location) {
      throw new Error("Ort fehlt");
    }

    // kleine Logik-Defaults (kannst du später feinjustieren)
    // Workshops sind oft paid/direct – aber du kannst es hier frei wählen
    const { error } = await supabase.from("courses_lite").insert({
      title,
      subtitle: subtitle || null,
      location,
      capacity,
      seats_taken: 0,

      offer_type,
      booking_mode,
      price_type,
      price_cents,
      currency,
    });

    if (error) throw new Error(error.message);

    redirect("/courses");
  }

  return (
    <main className="mx-auto max-w-md p-4 space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Kurs/Workshop anlegen</h1>
        <Link href="/courses" className="text-sm text-gray-600">
          Zurück
        </Link>
      </header>

      <form action={createCourse} className="space-y-4">
        <div className="space-y-2">
          <label className="block text-sm font-semibold">Titel</label>
          <input
            name="title"
            className="w-full rounded-xl border border-gray-200 p-3"
            placeholder="z. B. Impro Basics"
            required
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-semibold">Untertitel</label>
          <input
            name="subtitle"
            className="w-full rounded-xl border border-gray-200 p-3"
            placeholder="z. B. Locker werden & spielen"
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-semibold">Ort</label>
          <input
            name="location"
            className="w-full rounded-xl border border-gray-200 p-3"
            placeholder="z. B. Berlin-Mitte / Online"
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <label className="block text-sm font-semibold">Kapazität</label>
            <input
              name="capacity"
              type="number"
              min={1}
              defaultValue={10}
              className="w-full rounded-xl border border-gray-200 p-3"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold">Angebot</label>
            <select
              name="offer_type"
              defaultValue="course"
              className="w-full rounded-xl border border-gray-200 p-3"
            >
              <option value="course">Kurs (mit Schnupper/Approval)</option>
              <option value="workshop">Workshop (einmalig)</option>
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-semibold">Buchungsmodus</label>
          <select
            name="booking_mode"
            defaultValue="approval"
            className="w-full rounded-xl border border-gray-200 p-3"
          >
            <option value="approval">Erst reservieren (Dozent*in schaltet frei)</option>
            <option value="direct">Direkt buchbar</option>
            <option value="request">Nur Anfrage (Dozent*in bestätigt)</option>
          </select>
          <p className="text-xs text-gray-500">
            Tipp: Für deine Version 1 ist <b>approval</b> perfekt für Kurse. Für Workshops kannst du später
            „direct“ mit Zahlung verbinden.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <label className="block text-sm font-semibold">Preis</label>
            <select
              name="price_type"
              defaultValue="free"
              className="w-full rounded-xl border border-gray-200 p-3"
            >
              <option value="free">Kostenlos</option>
              <option value="paid">Kostenpflichtig</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold">Wert (EUR)</label>
            <input
              name="price_eur"
              type="number"
              min={0}
              defaultValue={0}
              className="w-full rounded-xl border border-gray-200 p-3"
            />
          </div>
        </div>

        <input type="hidden" name="currency" value="EUR" />

        <button
          type="submit"
          className="w-full rounded-xl py-2 font-semibold bg-black text-white active:scale-[0.99]"
        >
          Speichern
        </button>
      </form>

      <footer className="pt-2 text-xs text-gray-500">
        Hinweis: Für Workshops bauen wir die echte Zahlung als nächsten großen Schritt (Stripe/PayPal etc.).
      </footer>
    </main>
  );
}
