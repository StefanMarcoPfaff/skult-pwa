import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function PublicCoursesPage() {
  const supabase = await createSupabaseServerClient();

  const { data: courses, error } = await supabase
    .from("courses")
    .select("id, kind, title, location, starts_at, capacity, description")
    .eq("is_published", true)
    .order("created_at", { ascending: false });

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: 38, fontWeight: 900, margin: 0 }}>Angebote</h1>
        <Link href="/login" style={{ textDecoration: "none", fontWeight: 700 }}>
          Dozent*innen-Login
        </Link>
      </div>

      {error && (
        <p style={{ color: "crimson", marginTop: 16 }}>
          Fehler beim Laden: {error.message}
        </p>
      )}

      {!courses?.length ? (
        <p style={{ marginTop: 18, opacity: 0.7 }}>
          Noch keine veröffentlichten Angebote.
        </p>
      ) : (
        <div style={{ display: "grid", gap: 12, marginTop: 18 }}>
          {courses.map((c) => (
            <div
              key={c.id}
              style={{
                border: "1px solid #e5e5e5",
                borderRadius: 18,
                padding: 18,
                display: "grid",
                gap: 10,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 900 }}>
                    {c.title}{" "}
                    <span style={{ fontWeight: 700, opacity: 0.6 }}>
                      · {c.kind === "workshop" ? "Workshop" : "Kurs"}
                    </span>
                  </div>
                  <div style={{ marginTop: 6, opacity: 0.8 }}>
                    {c.location || "—"}
                    {c.starts_at ? (
                      <span> · {new Date(c.starts_at).toLocaleString("de-DE")}</span>
                    ) : null}
                    <span> · Plätze: {c.capacity}</span>
                  </div>
                </div>

                <div>
                  <Link
                    href={`/courses/${c.id}`}
                    style={{
                      display: "inline-block",
                      padding: "10px 14px",
                      borderRadius: 12,
                      background: c.kind === "workshop" ? "#000" : "#fff",
                      color: c.kind === "workshop" ? "#fff" : "#000",
                      border: c.kind === "workshop" ? "none" : "1px solid #ddd",
                      fontWeight: 900,
                      textDecoration: "none",
                    }}
                  >
                    {c.kind === "workshop" ? "Jetzt buchen" : "Kostenlose Probestunde"}
                  </Link>
                </div>
              </div>

              {c.description ? (
                <div style={{ opacity: 0.85, lineHeight: 1.4 }}>{c.description}</div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
