"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import ProviderBenefitsSection from "@/components/provider/ProviderBenefitsSection";
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
    <main className="min-h-screen bg-white px-5 py-8 text-slate-950 sm:px-8 sm:py-12">
      <div className="mx-auto max-w-5xl">
        <section className="mx-auto max-w-[520px] pb-14">
          <div className="mb-8">
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">RESER</p>
            <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">Login</h1>
            <p className="mt-4 text-base leading-7 text-slate-600">
              Für Anbietende. Wenn du noch keinen Zugang hast, registriere dich zuerst.
            </p>
          </div>

          <button
            onClick={signInWithGoogle}
            disabled={busy}
            className="mb-4 inline-flex min-h-12 w-full items-center justify-center rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Mit Google einloggen
          </button>

          <div className="mb-5">
            <Link href="/signup" className="text-sm font-semibold underline decoration-slate-300 underline-offset-4">
              Neu registrieren
            </Link>
          </div>

          <div className="mb-5 h-px bg-slate-200" />

          <form onSubmit={signInWithEmail} className="grid gap-3">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="E-Mail"
              type="email"
              required
              className="min-h-12 rounded-2xl border border-slate-300 px-4 text-base outline-none transition placeholder:text-slate-400 focus:border-slate-950"
            />
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Passwort"
              type="password"
              required
              className="min-h-12 rounded-2xl border border-slate-300 px-4 text-base outline-none transition placeholder:text-slate-400 focus:border-slate-950"
            />

            <button
              disabled={busy}
              className="mt-1 inline-flex min-h-12 items-center justify-center rounded-full border border-slate-950 bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Einloggen
            </button>

            <div className="mt-2 flex flex-col gap-2 text-sm sm:flex-row sm:justify-between">
              <Link href="/reset-password" className="underline decoration-slate-300 underline-offset-4">
                Passwort vergessen?
              </Link>
              <Link href="/signup" className="underline decoration-slate-300 underline-offset-4">
                Als Anbietende registrieren
              </Link>
            </div>

            {feedback ? <p className="mt-2 text-sm leading-6 text-slate-700">{feedback}</p> : null}
          </form>
        </section>

        <ProviderBenefitsSection />
      </div>
    </main>
  );
}
