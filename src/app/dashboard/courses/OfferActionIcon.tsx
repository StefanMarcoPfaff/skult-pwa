import type { ReactNode } from "react";

export function OfferActionIcon(props: {
  title: string;
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      title={props.title}
      aria-label={props.label}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full border bg-background transition ${props.className ?? "text-muted-foreground hover:text-foreground"}`}
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
