"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function SignupConfirmationClient() {
  const [supabase] = useState(() => createSupabaseBrowserClient());
  const searchParams = useSearchParams();
  const email = searchParams.get("email")?.trim() ?? "";

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function resendConfirmationEmail() {
    if (!email) {
      setMessage("Bitte registriere dich erneut, damit wir den Bestätigungslink senden können.");
      return;
    }

    setBusy(true);
    setMessage(null);

    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setMessage(error.message);
      setBusy(false);
      return;
    }

    setMessage("Wir haben dir den Bestätigungslink erneut geschickt.");
    setBusy(false);
  }

  return (
    <main style={{ maxWidth: 560, margin: "0 auto", padding: "48px 16px" }}>
      <h1 style={{ fontSize: 42, fontWeight: 800, marginBottom: 16 }}>
        Bitte bestätige jetzt deine E-Mail-Adresse.
      </h1>

      <div style={{ display: "grid", gap: 12, color: "#555", lineHeight: 1.6 }}>
        <p>Bitte prüfe jetzt dein Postfach und bestätige deine E-Mail-Adresse.</p>
        <p>Wir haben dir einen Bestätigungslink geschickt.</p>
        <p>
          Nach der Bestätigung kannst du dein Profil vervollständigen und deine ersten Angebote
          anlegen.
        </p>
        {email ? (
          <p style={{ color: "#111", fontWeight: 600 }}>Gesendet an: {email}</p>
        ) : null}
      </div>

      <div
        style={{
          marginTop: 24,
          border: "1px solid #e5e5e5",
          borderRadius: 16,
          padding: 20,
          background: "#fafafa",
        }}
      >
        <p style={{ margin: 0, color: "#555", lineHeight: 1.6 }}>
          Nach dem Klick auf den Link leiten wir dich direkt in dein Anbieter-Profil weiter, damit
          du dein Onboarding abschliessen kannst.
        </p>
      </div>

      <div style={{ display: "grid", gap: 12, marginTop: 24 }}>
        <Link
          href="/login"
          style={{
            display: "inline-block",
            textAlign: "center",
            padding: "14px 16px",
            borderRadius: 14,
            border: "1px solid #ddd",
            fontWeight: 700,
            textDecoration: "none",
            color: "#111",
          }}
        >
          Zurück zum Login
        </Link>

        <button
          type="button"
          onClick={resendConfirmationEmail}
          disabled={busy || !email}
          style={{
            padding: "14px 16px",
            borderRadius: 14,
            border: "1px solid #ddd",
            fontWeight: 700,
            background: "#fff",
            color: "#111",
            cursor: busy || !email ? "not-allowed" : "pointer",
          }}
        >
          {busy ? "Senden..." : "E-Mail erneut senden"}
        </button>
      </div>

      {message ? <p style={{ marginTop: 16, color: "#555" }}>{message}</p> : null}
    </main>
  );
}
