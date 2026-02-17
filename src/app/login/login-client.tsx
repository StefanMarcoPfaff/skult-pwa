"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function LoginClient() {
  const supabase = createSupabaseBrowserClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function signInWithGoogle() {
    setBusy(true);
    setMsg(null);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) setMsg(error.message);
    setBusy(false);
  }

  async function signInWithEmail(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setMsg(error.message);
    else setMsg("Eingeloggt ✅");

    setBusy(false);
  }

  return (
    <main style={{ maxWidth: 520, margin: "0 auto", padding: "48px 16px" }}>
      <h1 style={{ fontSize: 48, fontWeight: 800, marginBottom: 16 }}>Login</h1>

      <button
        onClick={signInWithGoogle}
        disabled={busy}
        style={{
          width: "100%",
          padding: "14px 16px",
          borderRadius: 14,
          border: "1px solid #ddd",
          fontWeight: 700,
          marginBottom: 16,
        }}
      >
        Mit Google einloggen
      </button>

      <div style={{ height: 1, background: "#eee", margin: "16px 0" }} />

      <form onSubmit={signInWithEmail} style={{ display: "grid", gap: 10 }}>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="E-Mail"
          type="email"
          required
          style={{ padding: 12, borderRadius: 12, border: "1px solid #ddd" }}
        />
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Passwort"
          type="password"
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
          Einloggen
        </button>

        {msg && <p style={{ marginTop: 6 }}>{msg}</p>}
      </form>
    </main>
  );
}
