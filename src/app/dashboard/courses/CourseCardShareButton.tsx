"use client";

import { useState } from "react";

export function CourseCardShareButton({ href, className }: { href: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  async function handleClick() {
    const absoluteHref =
      typeof window !== "undefined" ? new URL(href, window.location.origin).toString() : href;
    await navigator.clipboard.writeText(absoluteHref);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      type="button"
      title={copied ? "Link kopiert" : "teilen"}
      aria-label={copied ? "Link kopiert" : "teilen"}
      onClick={handleClick}
      className={className ?? "inline-flex h-9 w-9 items-center justify-center rounded-full border bg-background text-muted-foreground transition hover:text-foreground"}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
        <path d="M10 13a5 5 0 0 0 7.07 0l2.12-2.12a5 5 0 0 0-7.07-7.07L10.7 5.22" />
        <path d="M14 11a5 5 0 0 0-7.07 0L4.8 13.12a5 5 0 0 0 7.07 7.07l1.41-1.41" />
      </svg>
    </button>
  );
}
