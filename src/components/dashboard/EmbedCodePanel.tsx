"use client";

import { type ReactNode, useState } from "react";

type CopyState = "idle" | "copied" | "error";

function CopyButton({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  const [state, setState] = useState<CopyState>("idle");

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
      window.setTimeout(() => setState("idle"), 2000);
    } catch {
      setState("error");
      window.setTimeout(() => setState("idle"), 2500);
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex rounded-xl border px-3 py-2 text-xs font-semibold"
    >
      {state === "copied" ? "Kopiert" : state === "error" ? "Fehler beim Kopieren" : label}
    </button>
  );
}

export function EmbedCodePanel({
  isEnabled,
  publicUrl,
  embedUrl,
  title = "Teilen & Einbetten",
  description = "Oeffentlichen Link und Embed-Code fuer deine Website, Linktree oder andere Kanaele.",
  className = "mt-8 rounded-2xl border p-5",
  footer,
}: {
  isEnabled: boolean;
  publicUrl: string;
  embedUrl: string;
  title?: string;
  description?: string;
  className?: string;
  footer?: ReactNode;
}) {
  const embedCode = `<iframe
  src="${embedUrl}"
  width="100%"
  height="720"
  style="border:0;border-radius:16px;overflow:hidden"
  loading="lazy">
</iframe>`;

  return (
    <section className={className}>
      <div>
        <h2 className="text-2xl font-semibold">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      </div>

      {!isEnabled ? (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Einbetten ist erst moeglich, wenn dein Angebot veroeffentlicht und oeffentlich sichtbar ist.
        </p>
      ) : null}

      <div className={`mt-5 space-y-4 ${!isEnabled ? "opacity-50" : ""}`}>
        <div className="rounded-xl border p-4">
          <p className="text-sm font-semibold">Oeffentlicher Link</p>
          <code className="mt-2 block overflow-x-auto rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
            {publicUrl}
          </code>
          {isEnabled ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <CopyButton label="Link kopieren" value={publicUrl} />
              <a
                href={publicUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex rounded-xl border px-3 py-2 text-xs font-semibold"
              >
                Vorschau oeffnen
              </a>
            </div>
          ) : null}
        </div>

        <div className="rounded-xl border p-4">
          <p className="text-sm font-semibold">Embed-Link</p>
          <code className="mt-2 block overflow-x-auto rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
            {embedUrl}
          </code>
          {isEnabled ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <CopyButton label="Embed-Link kopieren" value={embedUrl} />
              <a
                href={embedUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex rounded-xl border px-3 py-2 text-xs font-semibold"
              >
                Embed-Vorschau oeffnen
              </a>
            </div>
          ) : null}
        </div>

        <div className="rounded-xl border p-4">
          <p className="text-sm font-semibold">Embed-Code</p>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-950 px-3 py-3 text-xs leading-6 text-slate-100">
            <code>{embedCode}</code>
          </pre>
          {isEnabled ? (
            <div className="mt-3">
              <CopyButton label="Embed-Code kopieren" value={embedCode} />
            </div>
          ) : null}
        </div>
      </div>

      {footer ? <div className="mt-5">{footer}</div> : null}
    </section>
  );
}
