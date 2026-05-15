"use client";

import type { ReactNode } from "react";

export type SortDirection = "asc" | "desc";

function SortArrow(props: { active: boolean; direction: SortDirection }) {
  if (!props.active) {
    return (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-3.5 w-3.5">
        <path d="m5 6 3-3 3 3" opacity="0.45" />
        <path d="m11 10-3 3-3-3" opacity="0.45" />
      </svg>
    );
  }

  return props.direction === "asc" ? (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-3.5 w-3.5">
      <path d="m5 9 3-3 3 3" />
    </svg>
  ) : (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-3.5 w-3.5">
      <path d="m5 7 3 3 3-3" />
    </svg>
  );
}

export default function SortableTableHeader(props: {
  label: string;
  active: boolean;
  direction: SortDirection;
  onToggle: () => void;
  align?: "left" | "right" | "center";
  className?: string;
  icon?: ReactNode;
}) {
  const justifyClass =
    props.align === "right" ? "justify-end" : props.align === "center" ? "justify-center" : "justify-start";

  return (
    <button
      type="button"
      onClick={props.onToggle}
      aria-label={`${props.label} sortieren`}
      aria-pressed={props.active}
      className={`inline-flex w-full items-center gap-2 rounded-lg px-1 py-1 text-xs font-semibold tracking-wide transition ${
        props.active ? "text-slate-900" : "text-slate-500 hover:text-slate-700"
      } ${justifyClass} ${props.className ?? ""}`}
    >
      {props.icon ? <span className="inline-flex h-3.5 w-3.5 items-center justify-center">{props.icon}</span> : null}
      <span>{props.label}</span>
      <SortArrow active={props.active} direction={props.direction} />
    </button>
  );
}
