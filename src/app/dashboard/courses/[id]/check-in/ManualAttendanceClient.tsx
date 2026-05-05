"use client";

import { useState, useTransition } from "react";

export type ManualAttendanceEntry = {
  id: string;
  ticketId: string;
  name: string;
  email: string | null;
  typeLabel: string;
  meta: string | null;
  legacyCheckedInAt: string | null;
  attendanceCheckedInAt: string | null;
};

function formatDateTime(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function ManualAttendanceClient(props: {
  courseId: string;
  sessionId?: string | null;
  eventDate?: string | null;
  room?: string | null;
  instructorName?: string | null;
  entries: ManualAttendanceEntry[];
}) {
  const [pending, startTransition] = useTransition();
  const [entries, setEntries] = useState(props.entries);
  const [message, setMessage] = useState<string | null>(null);

  function toggleAttendance(ticketId: string, present: boolean) {
    setMessage(null);

    startTransition(async () => {
      const response = await fetch("/api/attendance/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId: props.courseId,
          sessionId: props.sessionId ?? null,
          eventDate: props.eventDate ?? null,
          ticketId,
          present,
          room: props.room ?? null,
          instructorName: props.instructorName ?? null,
        }),
      });

      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        checkedInAt?: string | null;
      };

      if (!response.ok || !data.ok) {
        setMessage(data.error ?? "Anwesenheit konnte nicht gespeichert werden.");
        return;
      }

      setEntries((current) =>
        current.map((entry) =>
          entry.ticketId === ticketId
            ? {
                ...entry,
                attendanceCheckedInAt: present ? (data.checkedInAt ?? new Date().toISOString()) : null,
              }
            : entry
        )
      );
    });
  }

  return (
    <section className="space-y-4">
      {message ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {message}
        </p>
      ) : null}

      {entries.length === 0 ? (
        <section className="rounded-2xl border p-5 text-sm text-muted-foreground">
          Fuer diesen Termin wurden noch keine passenden Teilnehmer*innen gefunden.
        </section>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => {
            const isPresent = Boolean(entry.attendanceCheckedInAt);
            return (
              <article key={entry.id} className="rounded-2xl border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1 text-sm">
                    <p className="font-semibold text-foreground">{entry.name}</p>
                    {entry.email ? <p>{entry.email}</p> : null}
                    <p>
                      Typ: <span className="font-medium text-foreground">{entry.typeLabel}</span>
                    </p>
                    {entry.meta ? <p>{entry.meta}</p> : null}
                    <p>
                      Terminstatus:{" "}
                      <span className="font-medium text-foreground">
                        {isPresent
                          ? `Anwesend seit ${formatDateTime(entry.attendanceCheckedInAt) ?? "-"}`
                          : "Noch nicht fuer diesen Termin erfasst"}
                      </span>
                    </p>
                    {entry.legacyCheckedInAt ? (
                      <p className="text-xs text-muted-foreground">
                        Ticket bereits global eingecheckt am {formatDateTime(entry.legacyCheckedInAt) ?? "-"}.
                      </p>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={pending || isPresent}
                      onClick={() => toggleAttendance(entry.ticketId, true)}
                      className="rounded-xl border border-green-300 bg-green-50 px-3 py-2 text-xs font-semibold text-green-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isPresent ? "Anwesend" : "Als anwesend markieren"}
                    </button>
                    <button
                      type="button"
                      disabled={pending || !isPresent}
                      onClick={() => toggleAttendance(entry.ticketId, false)}
                      className="rounded-xl border px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Auf abwesend setzen
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
