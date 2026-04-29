"use client";

import { useId, useRef, useState } from "react";
import { getFirstDayOfNextMonthDate } from "@/lib/course-lifecycle";

function validateLastDayOfMonth(value: string): boolean {
  if (!value) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, 0)).getUTCDate() === parsed.getUTCDate();
}

function validateFirstDayOfMonth(value: string): boolean {
  if (!value) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.getUTCDate() === 1;
}

export function PauseCourseModal(props: {
  courseId: string;
  redirectTo: string;
  nextPossiblePauseDate: string;
  initialPauseStartDate?: string | null;
  initialPauseEndDate?: string | null;
  action: (formData: FormData) => void | Promise<void>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [pauseStartDate, setPauseStartDate] = useState(
    props.initialPauseStartDate || props.nextPossiblePauseDate
  );
  const [pauseEndDate, setPauseEndDate] = useState(
    props.initialPauseEndDate || getFirstDayOfNextMonthDate(props.initialPauseStartDate || props.nextPossiblePauseDate) || ""
  );
  const minimumResumeDate = getFirstDayOfNextMonthDate(pauseStartDate) || "";

  return (
    <>
      <button
        type="button"
        className="rounded-xl border px-4 py-2 text-sm font-semibold"
        onClick={() => dialogRef.current?.showModal()}
      >
        Pause planen
      </button>
      <dialog ref={dialogRef} aria-labelledby={titleId} className="w-full max-w-lg rounded-2xl border p-0 backdrop:bg-black/30">
        <div className="space-y-4 p-6">
          <div className="space-y-2">
            <h3 id={titleId} className="text-lg font-semibold">Kurspause planen</h3>
            <p className="text-sm text-muted-foreground">
              Naechstmoeglicher Pausenstart: {props.nextPossiblePauseDate}. Der Pausenstart muss immer am Monatsende liegen, das Wiederaufnahmedatum am Monatsersten.
            </p>
          </div>
          <form action={props.action} className="space-y-4">
            <input type="hidden" name="course_id" value={props.courseId} />
            <input type="hidden" name="redirect_to" value={props.redirectTo} />
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Pausenstart</span>
              <input
                type="date"
                name="pause_start_date"
                min={props.nextPossiblePauseDate}
                value={pauseStartDate}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setPauseStartDate(nextValue);
                  const nextResumeDate = getFirstDayOfNextMonthDate(nextValue) || "";
                  if (!pauseEndDate || pauseEndDate < nextResumeDate) {
                    setPauseEndDate(nextResumeDate);
                  }
                  event.target.setCustomValidity(
                    validateLastDayOfMonth(nextValue) ? "" : "Das Pausendatum muss der letzte Tag eines Monats sein."
                  );
                }}
                className="w-full rounded-xl border px-3 py-2"
                required
              />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Wiederaufnahme</span>
              <input
                type="date"
                name="pause_end_date"
                min={minimumResumeDate}
                value={pauseEndDate}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setPauseEndDate(nextValue);
                  const valid =
                    validateFirstDayOfMonth(nextValue) && (!minimumResumeDate || nextValue >= minimumResumeDate);
                  event.target.setCustomValidity(
                    valid ? "" : "Das Wiederaufnahmedatum muss ein Monatserster nach dem Pausenstart sein."
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

export function StopCourseModal(props: {
  courseId: string;
  redirectTo: string;
  nextPossibleStopDate: string;
  initialStopDate?: string | null;
  action: (formData: FormData) => void | Promise<void>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [stopDate, setStopDate] = useState(props.initialStopDate || props.nextPossibleStopDate);

  return (
    <>
      <button
        type="button"
        className="rounded-xl border px-4 py-2 text-sm font-semibold"
        onClick={() => dialogRef.current?.showModal()}
      >
        Stopp planen
      </button>
      <dialog ref={dialogRef} aria-labelledby={titleId} className="w-full max-w-lg rounded-2xl border p-0 backdrop:bg-black/30">
        <div className="space-y-4 p-6">
          <div className="space-y-2">
            <h3 id={titleId} className="text-lg font-semibold">Kursstopp planen</h3>
            <p className="text-sm text-muted-foreground">
              Bitte waehle den letzten Tag eines Monats als Enddatum. Der Kurs wird sofort aus der Veroeffentlichung genommen.
            </p>
          </div>
          <form action={props.action} className="space-y-4">
            <input type="hidden" name="course_id" value={props.courseId} />
            <input type="hidden" name="redirect_to" value={props.redirectTo} />
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Enddatum</span>
              <input
                type="date"
                name="stop_date"
                min={props.nextPossibleStopDate}
                value={stopDate}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setStopDate(nextValue);
                  event.target.setCustomValidity(
                    validateLastDayOfMonth(nextValue) ? "" : "Das Enddatum muss der letzte Tag eines Monats sein."
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
                Stopp speichern
              </button>
            </div>
          </form>
        </div>
      </dialog>
    </>
  );
}
