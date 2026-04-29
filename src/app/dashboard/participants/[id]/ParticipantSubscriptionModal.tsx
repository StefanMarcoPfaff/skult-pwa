"use client";

import { useId, useRef, useState } from "react";

export function ParticipantPauseModal(props: {
  reservationId: string;
  redirectTo: string;
  action: (formData: FormData) => void | Promise<void>;
  defaultPauseStartDate: string;
  defaultPauseEndDate?: string | null;
  minimumPauseEndDate: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [pauseEndDate, setPauseEndDate] = useState(props.defaultPauseEndDate || props.minimumPauseEndDate);

  return (
    <>
      <button
        type="button"
        className="rounded-xl border px-4 py-2 text-sm font-semibold"
        onClick={() => dialogRef.current?.showModal()}
      >
        Teilnahme pausieren
      </button>
      <dialog ref={dialogRef} aria-labelledby={titleId} className="w-full max-w-lg rounded-2xl border p-0 backdrop:bg-black/30">
        <div className="space-y-4 p-6">
          <div className="space-y-2">
            <h3 id={titleId} className="text-lg font-semibold">Teilnahme pausieren</h3>
            <p className="text-sm text-muted-foreground">
              Die Pause startet sofort. Waehle das Datum, an dem die Teilnahme automatisch wieder aktiviert werden soll.
            </p>
          </div>
          <form action={props.action} className="space-y-4">
            <input type="hidden" name="reservationId" value={props.reservationId} />
            <input type="hidden" name="redirect_to" value={props.redirectTo} />
            <input type="hidden" name="pause_start_date" value={props.defaultPauseStartDate} />
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Pause startet</span>
              <input
                type="date"
                value={props.defaultPauseStartDate}
                readOnly
                className="w-full rounded-xl border px-3 py-2 bg-muted/30"
              />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Automatisch fortsetzen am</span>
              <input
                type="date"
                name="pause_end_date"
                min={props.minimumPauseEndDate}
                value={pauseEndDate}
                onChange={(event) => {
                  setPauseEndDate(event.target.value);
                  event.target.setCustomValidity(
                    event.target.value >= props.minimumPauseEndDate
                      ? ""
                      : "Bitte waehle ein gueltiges Enddatum in der Zukunft."
                  );
                }}
                className="w-full rounded-xl border px-3 py-2"
                required
              />
            </label>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                className="rounded-xl border px-4 py-2 text-sm"
                onClick={() => dialogRef.current?.close()}
              >
                Abbrechen
              </button>
              <button type="submit" className="rounded-xl border px-4 py-2 text-sm font-semibold">
                Pause speichern
              </button>
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
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  return (
    <>
      <button
        type="button"
        className="rounded-xl border px-4 py-2 text-sm font-semibold"
        onClick={() => dialogRef.current?.showModal()}
      >
        Teilnahme beenden
      </button>
      <dialog ref={dialogRef} aria-labelledby={titleId} className="w-full max-w-lg rounded-2xl border p-0 backdrop:bg-black/30">
        <div className="space-y-4 p-6">
          <div className="space-y-2">
            <h3 id={titleId} className="text-lg font-semibold">Teilnahme beenden</h3>
            <p className="text-sm text-muted-foreground">
              Die Teilnahme wird zum Ende des aktuellen Abrechnungszeitraums beendet.
            </p>
          </div>
          <form action={props.action} className="space-y-4">
            <input type="hidden" name="reservationId" value={props.reservationId} />
            <input type="hidden" name="redirect_to" value={props.redirectTo} />
            <div className="flex justify-end gap-3">
              <button
                type="button"
                className="rounded-xl border px-4 py-2 text-sm"
                onClick={() => dialogRef.current?.close()}
              >
                Abbrechen
              </button>
              <button type="submit" className="rounded-xl border px-4 py-2 text-sm font-semibold">
                Zum Periodenende beenden
              </button>
            </div>
          </form>
        </div>
      </dialog>
    </>
  );
}
