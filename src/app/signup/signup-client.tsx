"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import ProviderBenefitsSection from "@/components/provider/ProviderBenefitsSection";
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
    <main className="min-h-screen bg-white px-5 py-8 text-slate-950 sm:px-8 sm:py-12">
      <div className="mx-auto max-w-5xl">
        <section className="mx-auto max-w-[520px] pb-14">
          <div className="mb-8">
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">RESER</p>
            <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">Registrieren</h1>
            <p className="mt-4 text-base leading-7 text-slate-600">
              Anbietende erstellen hier ihren Zugang und werden danach in das bestehende
              Profil-Onboarding weitergeleitet.
            </p>
          </div>

          <button
            onClick={signInWithGoogle}
            disabled={busy}
            className="mb-4 inline-flex min-h-12 w-full items-center justify-center rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Mit Google fortfahren
          </button>

          <div className="mb-4 text-sm leading-6 text-slate-600">
            Apple-Login ist für dieses MVP bewusst noch nicht aktiviert.
          </div>

          <div className="my-4 h-px bg-slate-200" />

          <form onSubmit={signUpWithEmail} className="grid gap-3">
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
              minLength={8}
              required
              className="min-h-12 rounded-2xl border border-slate-300 px-4 text-base outline-none transition placeholder:text-slate-400 focus:border-slate-950"
            />

            <button
              disabled={busy}
              className="mt-1 inline-flex min-h-12 items-center justify-center rounded-full border border-slate-950 bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Mit E-Mail registrieren
            </button>

            {msg ? <p className="mt-2 text-sm leading-6 text-slate-700">{msg}</p> : null}
          </form>

          <p className="mt-5 text-sm">
            Bereits registriert?{" "}
            <Link href="/login" className="underline decoration-slate-300 underline-offset-4">
              Zum Login
            </Link>
          </p>
        </section>

        <ProviderBenefitsSection />
      </div>
    </main>
  );
}
