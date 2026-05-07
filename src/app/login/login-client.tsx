"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function LoginClient() {
  const [supabase] = useState(() => createSupabaseBrowserClient());
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const urlMessage = searchParams.get("message");
  const urlError = searchParams.get("error");

  const feedback =
    msg ||
    (urlMessage === "password_updated"
      ? "Passwort aktualisiert. Du kannst dich jetzt einloggen."
      : urlMessage === "signup_check_email"
        ? "Bitte bestätige deine E-Mail über den Link in deinem Postfach."
        : null) ||
    (urlError === "oauth_failed"
      ? "Anmeldung konnte nicht abgeschlossen werden."
      : urlError === "otp_failed"
        ? "Der Link ist ungültig oder abgelaufen."
        : urlError === "missing_code"
          ? "Der Rückruf von Supabase war unvollständig."
          : null);

  async function signInWithGoogle() {
    setBusy(true);
    setMsg(null);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setMsg(error.message);
      setBusy(false);
    }
  }

  async function signInWithEmail(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setMsg(error.message);
      setBusy(false);
      return;
    }

    router.push("/auth/continue");
  }

  return (
    <main style={{ maxWidth: 520, margin: "0 auto", padding: "48px 16px" }}>
      <h1 style={{ fontSize: 48, fontWeight: 800, marginBottom: 16 }}>Login</h1>
      <p style={{ marginBottom: 20, color: "#555", lineHeight: 1.5 }}>
        Für Anbietende. Wenn du noch keinen Zugang hast, registriere dich zuerst.
      </p>

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

      <div style={{ marginBottom: 16 }}>
        <Link href="/signup" style={{ fontWeight: 600, textDecoration: "underline" }}>
          Neu registrieren
        </Link>
      </div>

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

        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 14 }}>
          <Link href="/reset-password" style={{ textDecoration: "underline" }}>
            Passwort vergessen?
          </Link>
          <Link href="/signup" style={{ textDecoration: "underline" }}>
            Als Anbietende registrieren
          </Link>
        </div>

        {feedback ? <p style={{ marginTop: 6 }}>{feedback}</p> : null}
      </form>
    </main>
  );
}
