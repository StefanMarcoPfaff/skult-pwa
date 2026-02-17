import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Workshop Flow (Stripe)
import { PayButton } from "./PayButton";

// Kurs Flow (kostenlose Probestunde)
import ReserveTrialButton from "./ReserveTrialButton";

type CourseRow = {
  id: string;
  title: string;
  subtitle: string | null;
  location: string | null;
  starts_at: string | null;
  capacity: number | null;
  seats_taken: number | null;
  kind: string | null; // "workshop" | "course"
};

function formatDateTime(dt: string | null) {
  if (!dt) return "";
  const d = new Date(dt);
  const date = d.toLocaleDateString("de-DE");
  const time = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  return `${date}, ${time}`;
}

export default async function CourseDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("courses_lite")
    .select("id,title,subtitle,location,starts_at,capacity,seats_taken,kind")
    .eq("id", params.id)
    .single<CourseRow>();

  if (error || !data) return notFound();

  const kind = (data.kind ?? "workshop").toLowerCase();
  const capacity = typeof data.capacity === "number" ? data.capacity : null;
  const taken = typeof data.seats_taken === "number" ? data.seats_taken : 0;
  const free = capacity === null ? null : Math.max(0, capacity - taken);

  return (
    <main style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <p>
        <Link href="/">← Zurück</Link>
      </p>

      <h1 style={{ marginTop: 8 }}>{data.title}</h1>

      <p style={{ color: "#444", marginTop: 6 }}>
        {data.location ? <span>{data.location}</span> : null}
        {data.location && data.starts_at ? " · " : null}
        {data.starts_at ? <span>{formatDateTime(data.starts_at)}</span> : null}
        {capacity !== null ? ` · Plätze: ${capacity}` : null}
        {free !== null ? ` · Frei: ${free}` : null}
      </p>

      {data.subtitle ? <p style={{ marginTop: 14 }}>{data.subtitle}</p> : null}

      <div style={{ marginTop: 24 }}>
        {kind === "workshop" ? (
          <PayButton courseId={data.id} />
        ) : (
          <ReserveTrialButton courseId={data.id} />
        )}
      </div>
    </main>
  );
}
