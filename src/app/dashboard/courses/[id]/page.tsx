import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Row = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string | null;
  capacity: number | null;
  kind: string | null;
  is_published: boolean | null;
};

function formatDateTime(dt: string | null) {
  if (!dt) return "";
  const d = new Date(dt);
  const date = d.toLocaleDateString("de-DE");
  const time = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  return `${date}, ${time}`;
}

export default async function DashboardCourseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data, error } = await supabase
    .from("courses")
    .select("id,title,description,location,starts_at,capacity,kind,is_published")
    .eq("id", id)
    .single<Row>();

  if (error || !data) {
    return (
      <main style={{ padding: 24 }}>
        <Link href="/dashboard" style={{ fontWeight: 700 }}>
          Zurueck
        </Link>
        <p style={{ marginTop: 16, fontSize: 18, fontWeight: 800 }}>Nicht gefunden</p>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, maxWidth: 820 }}>
      <Link href="/dashboard" style={{ fontWeight: 700 }}>
        Zurueck
      </Link>

      <h1 style={{ marginTop: 16, fontSize: 32, fontWeight: 900 }}>{data.title}</h1>

      <div style={{ marginTop: 10, opacity: 0.8 }}>
        <div>Art: {data.kind ?? "-"}</div>
        <div>Veroeffentlicht: {data.is_published ? "Ja" : "Nein"}</div>
        {data.location ? <div>Ort: {data.location}</div> : null}
        {data.starts_at ? <div>Start: {formatDateTime(data.starts_at)}</div> : null}
        {data.capacity !== null ? <div>Plaetze: {data.capacity}</div> : null}
      </div>

      {data.description ? (
        <p style={{ marginTop: 16, lineHeight: 1.6 }}>{data.description}</p>
      ) : null}
    </main>
  );
}
