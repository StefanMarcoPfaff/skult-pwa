import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-white px-6 py-10 text-slate-950 sm:px-8 sm:py-14">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-4xl flex-col items-center justify-center text-center">
        <div className="mb-8">
          <Image
            src="/RESER_Logo.png"
            alt="RESER Logo"
            width={320}
            height={128}
            priority
            className="mx-auto h-auto w-full max-w-[260px] sm:max-w-[320px]"
          />
        </div>

        <div className="max-w-3xl space-y-4">
          <h1 className="text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
            Find. Try. Reserve.
          </h1>

          <div className="mx-auto max-w-2xl space-y-4 text-base leading-7 text-slate-600 sm:text-lg">
            <p>
              Finde inspirierende Kurse und Workshops in deiner Nähe, probiere sie aus und buche direkt online.
            </p>
            <p>
              Oder erstelle eigene Angebote und erreiche genau die Menschen, die danach suchen.
            </p>
          </div>
        </div>

        <div className="mt-10 flex w-full max-w-xl flex-col justify-center gap-3 sm:flex-row">
          <Link
            href="/courses"
            className="inline-flex items-center justify-center rounded-full bg-slate-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Kurse & Workshops entdecken
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-full border border-slate-300 px-6 py-3 text-sm font-semibold text-slate-900 transition hover:border-slate-400 hover:bg-slate-50"
          >
            Als Dozent starten
          </Link>
        </div>
      </div>
    </main>
  );
}
