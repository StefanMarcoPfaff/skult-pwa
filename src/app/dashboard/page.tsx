import Link from "next/link";
import LogoutButton from "./logout-button";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // optional: redirect("/login");
    return <div>Bitte einloggen.</div>;
  }

  return (
    <main style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
        <div>
          <h1 style={{ margin: 0 }}>Dashboard</h1>
          <p>
            Eingeloggt als: <b>{user.email}</b>
          </p>

          {/* Öffentliche Kundenansicht */}
          <p>
            <Link href="/" style={{ fontWeight: 700 }}>
              Öffentliche Kundenansicht öffnen
            </Link>
          </p>
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          {/* ✅ WICHTIG: Erstellen-Seite */}
          <Link
            href="/courses/new"
            style={{
              padding: "14px 18px",
              borderRadius: 14,
              border: "1px solid #ddd",
              fontWeight: 700,
              textDecoration: "none",
              color: "inherit",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              whiteSpace: "nowrap",
            }}
          >
            + Kurs/Workshop anlegen
          </Link>

          <LogoutButton />
        </div>
      </div>

      <hr style={{ margin: "24px 0" }} />

      {/* ... dein Rest (Meine Angebote etc.) bleibt wie gehabt ... */}
    </main>
  );
}
