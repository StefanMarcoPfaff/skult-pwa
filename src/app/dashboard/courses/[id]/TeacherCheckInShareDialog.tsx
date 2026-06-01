"use client";

import { useRef, useState, useTransition } from "react";
import { OfferActionIcon, OfferActionItem } from "../OfferActionIcon";
import { createTeacherCheckInLinkAction, type CreateTeacherCheckInLinkResult } from "./actions";

function LinkGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
      <path d="M10 13a5 5 0 0 0 7.07 0l2.12-2.12a5 5 0 0 0-7.07-7.07L10.7 5.22" />
      <path d="M14 11a5 5 0 0 0-7.07 0L4.8 13.12a5 5 0 0 0 7.07 7.07l1.41-1.41" />
    </svg>
  );
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function getErrorMessage(error: CreateTeacherCheckInLinkResult extends infer T ? T extends { error: infer E } ? E : never : never) {
  if (error === "not_found") return "Das Angebot wurde nicht gefunden.";
  if (error === "create_failed") return "Der Link konnte nicht erstellt werden.";
  return "Der Link konnte nicht erstellt werden.";
}

export function TeacherCheckInShareDialog(props: { courseId: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<CreateTeacherCheckInLinkResult | null>(null);
  const [copied, setCopied] = useState(false);

  function createLink() {
    setCopied(false);
    const formData = new FormData();
    formData.set("course_id", props.courseId);
    startTransition(async () => {
      setResult(await createTeacherCheckInLinkAction(formData));
    });
  }

  async function copyLink(url: string) {
    await navigator.clipboard?.writeText(url);
    setCopied(true);
  }

  return (
    <OfferActionItem label="Dozent*innen-Link">
      <button
        type="button"
        className="inline-flex"
        title="Dozent*innen-Zugang teilen"
        aria-label="Dozent*innen-Zugang teilen"
        onClick={() => {
          setResult(null);
          setCopied(false);
          dialogRef.current?.showModal();
        }}
      >
        <OfferActionIcon title="Dozent*innen-Zugang teilen" label="Dozent*innen-Zugang teilen">
          <LinkGlyph />
        </OfferActionIcon>
      </button>

      <dialog ref={dialogRef} className="w-full max-w-xl rounded-2xl border p-0 backdrop:bg-black/30">
        <div className="space-y-4 p-6 text-left">
          <div className="space-y-2">
            <h3 className="text-lg font-semibold">Dozent*innen-Zugang teilen</h3>
            <p className="text-sm text-muted-foreground">
              Dieser Link erlaubt nur den Check-in für dieses Angebot. Er gibt keinen Zugriff auf Zahlungen,
              Kundendaten oder Studioverwaltung.
            </p>
          </div>

          {result?.ok ? (
            <div className="space-y-3">
              <div className="rounded-xl border bg-muted p-3 text-sm">
                <p className="font-semibold">Link einmalig kopieren</p>
                <p className="mt-2 break-all font-mono text-xs">{result.url}</p>
                <p className="mt-2 text-xs text-muted-foreground">Gültig bis {formatDateTime(result.expiresAt)}</p>
              </div>
              <button
                type="button"
                className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white"
                onClick={() => void copyLink(result.url)}
              >
                {copied ? "Kopiert" : "Link kopieren"}
              </button>
            </div>
          ) : null}

          {result && !result.ok ? (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {getErrorMessage(result.error)}
            </p>
          ) : null}

          <div className="flex justify-end gap-3">
            <button type="button" className="rounded-xl border px-4 py-2 text-sm" onClick={() => dialogRef.current?.close()}>
              Schließen
            </button>
            <button
              type="button"
              disabled={pending}
              className="rounded-xl border px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
              onClick={createLink}
            >
              {pending ? "Erstelle..." : result?.ok ? "Neuen Link erzeugen" : "Link erzeugen"}
            </button>
          </div>
        </div>
      </dialog>
    </OfferActionItem>
  );
}
