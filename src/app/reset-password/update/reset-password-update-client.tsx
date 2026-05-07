"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function ResetPasswordUpdateClient() {
  const [supabase] = useState(() => createSupabaseBrowserClient());
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!active) return;

      if (!user) {
        setMsg("Der Reset-Link ist ungültig oder abgelaufen. Bitte fordere ihn erneut an.");
      } else {
        setReady(true);
      }
    }

    void loadUser();

    return () => {
      active = false;
    };
  }, [supabase]);

  async function updatePassword(e: React.FormEvent) {
    e.preventDefault();

    if (password.length < 8) {
      setMsg("Das neue Passwort muss mindestens 8 Zeichen lang sein.");
      return;
    }

    if (password !== confirmPassword) {
      setMsg("Die Passwörter stimmen nicht überein.");
      return;
    }

    setBusy(true);
    setMsg(null);

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setMsg(error.message);
      setBusy(false);
      return;
    }

    router.push("/login?message=password_updated");
  }

  return (
    <main style={{ maxWidth: 520, margin: "0 auto", padding: "48px 16px" }}>
      <h1 style={{ fontSize: 40, fontWeight: 800, marginBottom: 16 }}>Neues Passwort</h1>
      <p style={{ marginBottom: 20, color: "#555", lineHeight: 1.5 }}>
        Vergib ein neues Passwort für deinen Zugang als Anbietende.
      </p>

      {ready ? (
        <form onSubmit={updatePassword} style={{ display: "grid", gap: 10 }}>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Neues Passwort"
            type="password"
            minLength={8}
            required
            style={{ padding: 12, borderRadius: 12, border: "1px solid #ddd" }}
          />
          <input
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Passwort wiederholen"
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
            Passwort speichern
          </button>
        </form>
      ) : null}

      {msg ? <p style={{ marginTop: 12 }}>{msg}</p> : null}

      <p style={{ marginTop: 20, fontSize: 14 }}>
        <Link href="/reset-password" style={{ textDecoration: "underline" }}>
          Neuen Reset-Link anfordern
        </Link>
      </p>
    </main>
  );
}
