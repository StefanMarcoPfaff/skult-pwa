"use client";

import type { ReactNode } from "react";
import { useId, useRef } from "react";

export function ConfirmIconAction(props: {
  action: (formData: FormData) => void | Promise<void>;
  fields: Record<string, string>;
  title: string;
  text: string;
  confirmLabel: string;
  cancelLabel: string;
  disabled?: boolean;
  triggerLabel: string;
  trigger: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  return (
    <>
      <button
        type="button"
        disabled={props.disabled}
        onClick={() => dialogRef.current?.showModal()}
        className="disabled:cursor-not-allowed disabled:opacity-50"
        title={props.triggerLabel}
        aria-label={props.triggerLabel}
      >
        {props.trigger}
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        className="w-full max-w-lg rounded-2xl border p-0 backdrop:bg-black/30"
      >
        <div className="space-y-4 p-6">
          <div className="space-y-2">
            <h3 id={titleId} className="text-lg font-semibold">
              {props.title}
            </h3>
            <p className="text-sm text-muted-foreground">{props.text}</p>
          </div>
          <form action={props.action} className="space-y-4">
            {Object.entries(props.fields).map(([name, value]) => (
              <input key={name} type="hidden" name={name} value={value} />
            ))}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                className="rounded-xl border px-4 py-2 text-sm"
                onClick={() => dialogRef.current?.close()}
              >
                {props.cancelLabel}
              </button>
              <button type="submit" className="rounded-xl border px-4 py-2 text-sm font-semibold">
                {props.confirmLabel}
              </button>
            </div>
          </form>
        </div>
      </dialog>
    </>
  );
}
