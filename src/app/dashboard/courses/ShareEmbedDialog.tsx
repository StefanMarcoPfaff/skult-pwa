"use client";

import type { ReactNode } from "react";
import { useId, useRef } from "react";
import { EmbedCodePanel } from "@/components/dashboard/EmbedCodePanel";

export function ShareEmbedDialog(props: {
  isEnabled: boolean;
  publicUrl: string;
  embedUrl: string;
  triggerLabel: string;
  trigger: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  return (
    <>
      <button
        type="button"
        title={props.triggerLabel}
        aria-label={props.triggerLabel}
        onClick={() => dialogRef.current?.showModal()}
      >
        {props.trigger}
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        className="w-full max-w-3xl rounded-2xl border p-0 backdrop:bg-black/30"
      >
        <div className="p-6">
          <h3 id={titleId} className="sr-only">
            Teilen & Einbetten
          </h3>
          <EmbedCodePanel
            isEnabled={props.isEnabled}
            publicUrl={props.publicUrl}
            embedUrl={props.embedUrl}
            title="Teilen & Einbetten"
            description="Oeffentlicher Link, Embed-Link und Embed-Code fuer dein Angebot."
            className="rounded-2xl border p-5"
            footer={
              <div className="flex justify-end">
                <button
                  type="button"
                  className="rounded-xl border px-4 py-2 text-sm"
                  onClick={() => dialogRef.current?.close()}
                >
                  Schliessen
                </button>
              </div>
            }
          />
        </div>
      </dialog>
    </>
  );
}
