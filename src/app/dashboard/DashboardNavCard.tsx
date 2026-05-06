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
      ? "border-green-200 bg-green-50/60"
      : props.tone === "orange"
        ? "border-orange-200 bg-orange-50/60"
        : props.tone === "blue"
          ? "border-blue-200 bg-blue-50/60"
          : "border-slate-200 bg-white";

  return (
    <Link
      href={props.href}
      className={`group block rounded-3xl border p-6 transition hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 ${toneClass}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-3">
          <h2 className="text-2xl font-semibold tracking-tight">{props.title}</h2>
          <p className="max-w-md text-sm leading-6 text-muted-foreground">{props.description}</p>
        </div>
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-black/10 bg-white/80 text-foreground shadow-sm">
          {props.icon}
        </span>
      </div>

      <div className="mt-8 flex items-end justify-between gap-4 border-t border-black/5 pt-4">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">{props.footerLabel}</p>
        <p className="text-lg font-semibold text-foreground">{props.footerValue}</p>
      </div>
    </Link>
  );
}
