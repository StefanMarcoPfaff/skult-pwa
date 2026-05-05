"use client";

import type { ReactNode } from "react";
import { useId, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  getFutureFirstOfMonthOptions,
  getFutureMonthEndOptions,
  getNextFirstOfMonthAfter,
  getNextMonthEndDate,
} from "@/lib/course-lifecycle-shared";

function ModalSubmitButton(props: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="rounded-xl border px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50">
      {pending ? "Speichert..." : props.label}
    </button>
  );
}

export function PauseCourseModal(props: {
  courseId: string;
  redirectTo: string;
  nextPossiblePauseDate: string;
  initialPauseStartDate?: string | null;
  initialPauseEndDate?: string | null;
  action: (formData: FormData) => void | Promise<void>;
  triggerContent?: ReactNode;
  triggerTitle?: string;
  triggerDisabled?: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const defaultActiveUntilDate = props.initialPauseStartDate
    ? getNextMonthEndDate(new Date(`${props.initialPauseStartDate}T00:00:00+01:00`))
    : props.nextPossiblePauseDate;
  const [activeUntilDate, setActiveUntilDate] = useState(defaultActiveUntilDate);
  const [pauseEndDate, setPauseEndDate] = useState(
    props.initialPauseEndDate || getNextFirstOfMonthAfter(defaultActiveUntilDate) || ""
  );
  const minimumResumeDate = getNextFirstOfMonthAfter(activeUntilDate) || "";
  const monthEndOptions = getFutureMonthEndOptions(new Date(), 12);
  const resumeOptions = getFutureFirstOfMonthOptions(activeUntilDate, 12);

  return (
    <>
      <button
        type="button"
        className="disabled:cursor-not-allowed disabled:opacity-50"
        title={props.triggerTitle ?? "Pause planen"}
        aria-label={props.triggerTitle ?? "Pause planen"}
        disabled={props.triggerDisabled}
        onClick={() => dialogRef.current?.showModal()}
      >
        {props.triggerContent ?? (
          <span className="rounded-xl border px-4 py-2 text-sm font-semibold">Pause planen</span>
        )}
      </button>
      <dialog ref={dialogRef} aria-labelledby={titleId} className="w-full max-w-lg rounded-2xl border p-0 backdrop:bg-black/30">
        <div className="space-y-4 p-6">
          <div className="space-y-2">
            <h3 id={titleId} className="text-lg font-semibold">Moechtest du dieses Angebot pausieren?</h3>
            <p className="text-sm text-muted-foreground">
              Waehle, bis wann der Kurs noch laeuft, und ab wann er wieder startet. Pausen werden monatsweise geplant.
            </p>
          </div>
          <form action={props.action} className="space-y-4">
            <input type="hidden" name="course_id" value={props.courseId} />
            <input type="hidden" name="redirect_to" value={props.redirectTo} />
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Kurs laeuft noch bis</span>
              <input
                type="date"
                name="active_until_date"
                min={props.nextPossiblePauseDate}
                list={`course-pause-month-ends-${props.courseId}`}
                value={activeUntilDate}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setActiveUntilDate(nextValue);
                  const nextResumeDate = getNextFirstOfMonthAfter(nextValue) || "";
                  if (!pauseEndDate || pauseEndDate < nextResumeDate) {
                    setPauseEndDate(nextResumeDate);
                  }
                }}
                className="w-full rounded-xl border px-3 py-2"
                required
              />
              <datalist id={`course-pause-month-ends-${props.courseId}`}>
                {monthEndOptions.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            </label>
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Kurs startet wieder am</span>
              <input
                type="date"
                name="pause_end_date"
                min={minimumResumeDate}
                list={`course-pause-month-starts-${props.courseId}`}
                value={pauseEndDate}
                onChange={(event) => {
                  setPauseEndDate(event.target.value);
                }}
                className="w-full rounded-xl border px-3 py-2"
                required
              />
              <datalist id={`course-pause-month-starts-${props.courseId}`}>
                {resumeOptions.map((option) => (
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

export function StopCourseModal(props: {
  courseId: string;
  redirectTo: string;
  nextPossibleStopDate: string;
  initialStopDate?: string | null;
  action: (formData: FormData) => void | Promise<void>;
  triggerContent?: ReactNode;
  triggerTitle?: string;
  triggerDisabled?: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [stopDate, setStopDate] = useState(props.initialStopDate || props.nextPossibleStopDate);

  return (
    <>
      <button
        type="button"
        className="disabled:cursor-not-allowed disabled:opacity-50"
        title={props.triggerTitle ?? "Stopp planen"}
        aria-label={props.triggerTitle ?? "Stopp planen"}
        disabled={props.triggerDisabled}
        onClick={() => dialogRef.current?.showModal()}
      >
        {props.triggerContent ?? (
          <span className="rounded-xl border px-4 py-2 text-sm font-semibold">Stopp planen</span>
        )}
      </button>
      <dialog ref={dialogRef} aria-labelledby={titleId} className="w-full max-w-lg rounded-2xl border p-0 backdrop:bg-black/30">
        <div className="space-y-4 p-6">
          <div className="space-y-2">
            <h3 id={titleId} className="text-lg font-semibold">Moechtest du dieses Angebot stoppen?</h3>
            <p className="text-sm text-muted-foreground">
              Waehle den letzten Kurstag. Das Angebot wird danach nicht mehr oeffentlich buchbar sein.
            </p>
          </div>
          <form action={props.action} className="space-y-4">
            <input type="hidden" name="course_id" value={props.courseId} />
            <input type="hidden" name="redirect_to" value={props.redirectTo} />
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Letzter Kurstag</span>
              <input
                type="date"
                name="stop_date"
                min={props.nextPossibleStopDate}
                list={`course-stop-month-ends-${props.courseId}`}
                value={stopDate}
                onChange={(event) => {
                  setStopDate(event.target.value);
                }}
                className="w-full rounded-xl border px-3 py-2"
                required
              />
              <datalist id={`course-stop-month-ends-${props.courseId}`}>
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
              <ModalSubmitButton label="Kurs stoppen" />
            </div>
          </form>
        </div>
      </dialog>
    </>
  );
}
