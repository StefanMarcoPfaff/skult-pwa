"use client";

import Link from "next/link";
import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function ResetPasswordRequestClient() {
  const [supabase] = useState(() => createSupabaseBrowserClient());

  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function requestReset(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password/update`,
    });

    if (error) {
      setMsg(error.message);
    } else {
      setMsg("Wenn ein Konto existiert, wurde eine E-Mail zum Zuruecksetzen verschickt.");
    }

    setBusy(false);
  }

  return (
    <main style={{ maxWidth: 520, margin: "0 auto", padding: "48px 16px" }}>
      <h1 style={{ fontSize: 40, fontWeight: 800, marginBottom: 16 }}>Passwort zuruecksetzen</h1>
      <p style={{ marginBottom: 20, color: "#555", lineHeight: 1.5 }}>
        Gib deine E-Mail-Adresse ein. Wir schicken dir einen Link, ueber den du ein neues Passwort
        vergeben kannst.
      </p>

      <form onSubmit={requestReset} style={{ display: "grid", gap: 10 }}>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="E-Mail"
          type="email"
          required
          style={{ padding: 12, borderRadius: 12, border: "1px solid #ddd" }}
        />

        <button
          disabled={busy}
          style={{
            padding: "14px 16px",
            borderRadius: 14,
            border: "1px solid #ddd",
            fontWeight: 800,
            background: "#000",
            color: "#fff",
          }}
        >
          Reset-Link anfordern
        </button>

        {msg ? <p style={{ marginTop: 6 }}>{msg}</p> : null}
      </form>

      <p style={{ marginTop: 20, fontSize: 14 }}>
        <Link href="/login" style={{ textDecoration: "underline" }}>
          Zurueck zum Login
        </Link>
      </p>
    </main>
  );
}
