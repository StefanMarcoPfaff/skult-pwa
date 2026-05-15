import Link from "next/link";
import type { ReactNode } from "react";

export function DashboardNavCard(props: {
  href: string;
  title: string;
  description: string;
  footerLabel: string;
  footerValue: string;
  icon: ReactNode;
  tone?: "neutral" | "green" | "orange" | "blue";
}) {
  const toneClass =
    props.tone === "green"
      ? "border-emerald-200 bg-emerald-50/70"
      : props.tone === "orange"
        ? "border-amber-200 bg-amber-50/75"
        : props.tone === "blue"
          ? "border-sky-200 bg-sky-50/75"
          : "border-stone-200 bg-stone-50/80";

  return (
    <Link
      href={props.href}
      className={`group block min-h-56 rounded-[2rem] border p-6 transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 ${toneClass}`}
    >
      <div className="flex h-full flex-col justify-between gap-8">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-3">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">{props.title}</h2>
            <p className="max-w-md text-sm leading-6 text-slate-600">{props.description}</p>
          </div>
          <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-black/5 bg-white/85 text-slate-800 shadow-sm">
            {props.icon}
          </span>
        </div>

        <div className="flex items-end justify-between gap-4 border-t border-black/5 pt-4">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">{props.footerLabel}</p>
          <p className="text-lg font-semibold text-slate-900">{props.footerValue}</p>
        </div>
      </div>
    </Link>
  );
}
