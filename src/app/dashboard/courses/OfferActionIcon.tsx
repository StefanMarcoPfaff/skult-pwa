import type { ReactNode } from "react";

export function OfferActionIcon(props: {
  title: string;
  label: string;
  className?: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      title={props.title}
      aria-label={props.label}
      aria-disabled={props.disabled ? "true" : undefined}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full border transition ${
        props.className ?? "border-slate-200 bg-background text-muted-foreground hover:text-foreground"
      } ${props.disabled ? "cursor-not-allowed" : ""}`}
    >
      {props.children}
    </span>
  );
}

export function OfferActionItem(props: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-14 flex-col items-center gap-2 text-center">
      {props.children}
      <span className="text-xs font-medium text-muted-foreground">{props.label}</span>
    </div>
  );
}
