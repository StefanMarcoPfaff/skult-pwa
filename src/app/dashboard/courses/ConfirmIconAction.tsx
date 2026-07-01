"use client";

import { useRouter } from "next/navigation";
import type { FormEvent, ReactNode } from "react";
import { useId, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";

type ServerActionResult = { ok?: boolean; error?: string; missingFields?: string[] } | void;

function ConfirmSubmitButton(props: { label: string; pending?: boolean }) {
  const formStatus = useFormStatus();
  const pending = props.pending ?? formStatus.pending;
  return (
    <button type="submit" disabled={pending} className="rounded-xl border px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50">
      {pending ? "Speichert..." : props.label}
    </button>
  );
}

function isResultObject(value: unknown): value is { ok?: boolean; error?: string; missingFields?: string[] } {
  return typeof value === "object" && value !== null && ("ok" in value || "error" in value);
}

function formatMissingFields(missingFields: string[] | undefined): string | null {
  if (!missingFields?.length) return null;
  return missingFields.map((field) => `- ${field}`).join("\n");
}

function getErrorMessage(errorCode: string | undefined, missingFields?: string[]) {
  switch (errorCode) {
    case "invalid_request":
      return "Die Aktion konnte nicht gestartet werden.";
    case "not_found":
      return "Das Angebot wurde nicht gefunden.";
    case "invalid_status":
      return "Dieses Angebot kann in seinem aktuellen Status nicht aktiviert werden.";
    case "missing_policy":
      return "Vor der Aktivierung muss zuerst eine Storno- bzw. Kündigungsregel hinterlegt sein.";
    case "missing_paid_offer_profile": {
      const details = formatMissingFields(missingFields);
      return details
        ? `Kostenpflichtige Angebote koennen noch nicht veroeffentlicht werden:\n${details}`
        : "Kostenpflichtige Angebote koennen erst veroeffentlicht werden, wenn Steuer-, Adress-, Auszahlungs- und Stripe-Daten vollstaendig sind.";
    }
    case "update_failed":
      return "Das Angebot konnte nicht aktiviert werden. Bitte versuche es erneut.";
    case "timeout":
      return "Die Aktivierung hat zu lange gedauert. Bitte prüfe den Status und versuche es erneut.";
    default:
      return "Die Aktion ist fehlgeschlagen. Bitte versuche es erneut.";
  }
}

async function runWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error("timeout"));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

export function ConfirmIconAction(props: {
  action: (formData: FormData) => ServerActionResult | Promise<ServerActionResult>;
  fields: Record<string, string>;
  title: string;
  text: string;
  confirmLabel: string;
  cancelLabel: string;
  disabled?: boolean;
  triggerLabel: string;
  trigger: ReactNode;
  clientAction?: boolean;
  timeoutMs?: number;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const serverFormAction = props.clientAction
    ? undefined
    : (props.action as (formData: FormData) => void | Promise<void>);

  function resetDialogState() {
    setErrorMessage(null);
  }

  function closeDialog() {
    resetDialogState();
    dialogRef.current?.close();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (!props.clientAction) {
      return;
    }

    event.preventDefault();
    setErrorMessage(null);

    const formData = new FormData(event.currentTarget);
    startTransition(() => {
      void runWithTimeout(Promise.resolve(props.action(formData)), props.timeoutMs ?? 15000)
        .then((result) => {
          if (isResultObject(result) && result.ok === false) {
            setErrorMessage(getErrorMessage(result.error, result.missingFields));
            return;
          }

          closeDialog();
          router.refresh();
        })
        .catch((error) => {
          setErrorMessage(getErrorMessage(error instanceof Error ? error.message : undefined));
        });
    });
  }

  return (
    <>
      <button
        type="button"
        disabled={props.disabled}
        onClick={() => {
          resetDialogState();
          dialogRef.current?.showModal();
        }}
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
          <form action={serverFormAction} onSubmit={handleSubmit} className="space-y-4">
            {Object.entries(props.fields).map(([name, value]) => (
              <input key={name} type="hidden" name={name} value={value} />
            ))}
            {errorMessage ? (
              <p className="whitespace-pre-line rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</p>
            ) : null}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                className="rounded-xl border px-4 py-2 text-sm"
                onClick={closeDialog}
              >
                {props.cancelLabel}
              </button>
              <ConfirmSubmitButton label={props.confirmLabel} pending={props.clientAction ? pending : undefined} />
            </div>
          </form>
        </div>
      </dialog>
    </>
  );
}
