"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function SignupClient() {
  const [supabase] = useState(() => createSupabaseBrowserClient());
  const router = useRouter();

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

    if (error) {
      setMsg(error.message);
      setBusy(false);
    }
  }

  async function signUpWithEmail(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: {
          account_type: "provider",
        },
      },
    });

    if (error) {
      setMsg(error.message);
      setBusy(false);
      return;
    }

    if (data.session) {
      router.push("/auth/continue");
      return;
    }

    router.push(`/signup/confirmation?email=${encodeURIComponent(email)}`);
  }

  return (
    <main style={{ maxWidth: 520, margin: "0 auto", padding: "48px 16px" }}>
      <h1 style={{ fontSize: 48, fontWeight: 800, marginBottom: 16 }}>Registrieren</h1>
      <p style={{ marginBottom: 20, color: "#555", lineHeight: 1.5 }}>
        Lehrer*innen und Anbieter erstellen hier ihren Zugang und werden danach in das bestehende
        Profil-Onboarding weitergeleitet.
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
        Mit Google fortfahren
      </button>

      <div style={{ marginBottom: 16, fontSize: 14, color: "#555" }}>
        Apple-Login ist für dieses MVP bewusst noch nicht aktiviert.
      </div>

      <div style={{ height: 1, background: "#eee", margin: "16px 0" }} />

      <form onSubmit={signUpWithEmail} style={{ display: "grid", gap: 10 }}>
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
          minLength={8}
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
          Mit E-Mail registrieren
        </button>

        {msg ? <p style={{ marginTop: 6 }}>{msg}</p> : null}
      </form>

      <p style={{ marginTop: 20, fontSize: 14 }}>
        Bereits registriert?{" "}
        <Link href="/login" style={{ textDecoration: "underline" }}>
          Zum Login
        </Link>
      </p>
    </main>
  );
}
