"use client";

import type { ReactNode } from "react";
import { useId, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  getFutureFirstOfMonthOptions,
  getFutureMonthEndOptions,
  getNextFirstOfMonthAfter,
} from "@/lib/course-lifecycle-shared";

function ModalSubmitButton(props: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="rounded-xl border px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50">
      {pending ? "Speichert..." : props.label}
    </button>
  );
}

export function ParticipantPauseModal(props: {
  reservationId: string;
  redirectTo: string;
  action: (formData: FormData) => void | Promise<void>;
  defaultActiveUntilDate: string;
  defaultPauseEndDate?: string | null;
  triggerContent?: ReactNode;
  triggerTitle?: string;
  triggerDisabled?: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [activeUntilDate, setActiveUntilDate] = useState(props.defaultActiveUntilDate);
  const minimumPauseEndDate = getNextFirstOfMonthAfter(activeUntilDate) || "";
  const [pauseEndDate, setPauseEndDate] = useState(props.defaultPauseEndDate || minimumPauseEndDate);

  return (
    <>
      <button
        type="button"
        className="disabled:cursor-not-allowed disabled:opacity-50"
        title={props.triggerTitle ?? "Teilnahme pausieren"}
        aria-label={props.triggerTitle ?? "Teilnahme pausieren"}
        disabled={props.triggerDisabled}
        onClick={() => dialogRef.current?.showModal()}
      >
        {props.triggerContent ?? <span className="rounded-xl border px-4 py-2 text-sm font-semibold">Teilnahme pausieren</span>}
      </button>
      <dialog ref={dialogRef} aria-labelledby={titleId} className="w-full max-w-lg rounded-2xl border p-0 backdrop:bg-black/30">
        <div className="space-y-4 p-6">
          <div className="space-y-2">
            <h3 id={titleId} className="text-lg font-semibold">Moechtest du diesen Teilnehmenden pausieren?</h3>
            <p className="text-sm text-muted-foreground">
              Waehle, bis wann die Teilnahme noch laeuft, und ab wann sie wieder startet. Der Platz bleibt reserviert.
            </p>
          </div>
          <form action={props.action} className="space-y-4">
            <input type="hidden" name="reservationId" value={props.reservationId} />
            <input type="hidden" name="redirect_to" value={props.redirectTo} />
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Teilnahme laeuft noch bis</span>
              <input
                type="date"
                name="active_until_date"
                list={`participant-pause-month-ends-${props.reservationId}`}
                value={activeUntilDate}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setActiveUntilDate(nextValue);
                  const nextResume = getNextFirstOfMonthAfter(nextValue) || "";
                  if (!pauseEndDate || pauseEndDate < nextResume) {
                    setPauseEndDate(nextResume);
                  }
                }}
                className="w-full rounded-xl border px-3 py-2"
              />
              <datalist id={`participant-pause-month-ends-${props.reservationId}`}>
                {getFutureMonthEndOptions(new Date(), 12).map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            </label>
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Teilnahme startet wieder am</span>
              <input
                type="date"
                name="pause_end_date"
                min={minimumPauseEndDate}
                list={`participant-pause-month-starts-${props.reservationId}`}
                value={pauseEndDate}
                onChange={(event) => {
                  setPauseEndDate(event.target.value);
                }}
                className="w-full rounded-xl border px-3 py-2"
                required
              />
              <datalist id={`participant-pause-month-starts-${props.reservationId}`}>
                {getFutureFirstOfMonthOptions(activeUntilDate, 12).map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            </label>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                className="rounded-xl border px-4 py-2 text-sm"
                onClick={() => dialogRef.current?.close()}
              >
                Abbrechen
              </button>
              <ModalSubmitButton label="Pause speichern" />
            </div>
          </form>
        </div>
      </dialog>
    </>
  );
}

export function ParticipantStopModal(props: {
  reservationId: string;
  redirectTo: string;
  action: (formData: FormData) => void | Promise<void>;
  defaultStopDate: string;
  triggerContent?: ReactNode;
  triggerTitle?: string;
  triggerDisabled?: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [stopDate, setStopDate] = useState(props.defaultStopDate);

  return (
    <>
      <button
        type="button"
        className="disabled:cursor-not-allowed disabled:opacity-50"
        title={props.triggerTitle ?? "Teilnahme kuendigen"}
        aria-label={props.triggerTitle ?? "Teilnahme kuendigen"}
        disabled={props.triggerDisabled}
        onClick={() => dialogRef.current?.showModal()}
      >
        {props.triggerContent ?? <span className="rounded-xl border px-4 py-2 text-sm font-semibold">Teilnahme beenden</span>}
      </button>
      <dialog ref={dialogRef} aria-labelledby={titleId} className="w-full max-w-lg rounded-2xl border p-0 backdrop:bg-black/30">
        <div className="space-y-4 p-6">
          <div className="space-y-2">
            <h3 id={titleId} className="text-lg font-semibold">Moechtest du diesen Teilnehmenden kuendigen?</h3>
            <p className="text-sm text-muted-foreground">
              Lege fest, zu welchem Monatsende die Teilnahme endet.
            </p>
          </div>
          <form action={props.action} className="space-y-4">
            <input type="hidden" name="reservationId" value={props.reservationId} />
            <input type="hidden" name="redirect_to" value={props.redirectTo} />
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Teilnahme endet zum</span>
              <input
                type="date"
                name="stop_date"
                list={`participant-stop-month-ends-${props.reservationId}`}
                value={stopDate}
                onChange={(event) => setStopDate(event.target.value)}
                className="w-full rounded-xl border px-3 py-2"
                required
              />
              <datalist id={`participant-stop-month-ends-${props.reservationId}`}>
                {getFutureMonthEndOptions(new Date(), 12).map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            </label>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                className="rounded-xl border px-4 py-2 text-sm"
                onClick={() => dialogRef.current?.close()}
              >
                Abbrechen
              </button>
              <ModalSubmitButton label="Kuendigung speichern" />
            </div>
          </form>
        </div>
      </dialog>
    </>
  );
}
