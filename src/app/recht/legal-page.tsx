import Link from "next/link";
import type { ReactNode } from "react";

type LegalSection = {
  title: string;
  content: ReactNode;
};

export default function LegalPage({
  eyebrow,
  title,
  intro,
  sections,
}: {
  eyebrow: string;
  title: string;
  intro?: ReactNode;
  sections: LegalSection[];
}) {
  return (
    <main className="bg-slate-50 px-6 py-12 text-slate-900 sm:px-8 sm:py-16">
      <div className="mx-auto max-w-3xl">
        <div className="rounded-[28px] border border-slate-200 bg-white px-6 py-8 shadow-sm sm:px-10 sm:py-10">
          <header className="space-y-4 border-b border-slate-200 pb-8">
            <Link
              href="/"
              className="inline-flex text-sm font-medium text-slate-600 transition hover:text-slate-900"
            >
              Zurück zur Startseite
            </Link>
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                {eyebrow}
              </p>
              <h1 className="text-3xl font-semibold tracking-[-0.03em] text-slate-950 sm:text-4xl">
                {title}
              </h1>
              {intro ? <div className="max-w-2xl text-sm leading-7 text-slate-600">{intro}</div> : null}
            </div>
          </header>

          <div className="space-y-10 pt-8">
            {sections.map((section) => (
              <section key={section.title} className="space-y-3">
                <h2 className="text-xl font-semibold tracking-[-0.02em] text-slate-950">
                  {section.title}
                </h2>
                <div className="space-y-3 text-sm leading-7 text-slate-700">{section.content}</div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
