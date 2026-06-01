"use client";

import { useState, useTransition } from "react";

export type TeacherMagicEntry = {
  id: string;
  ticketId: string;
  firstName: string;
  lastName: string;
  attendanceStatus: "present" | "excused" | "absent" | "open" | "unexcused";
  markedAt: string | null;
};

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function TeacherMagicCheckInClient(props: {
  accessToken: string;
  sessionId?: string | null;
  eventDate?: string | null;
  room?: string | null;
  instructorName?: string | null;
  checkInEnabled: boolean;
  entries: TeacherMagicEntry[];
}) {
  const [pending, startTransition] = useTransition();
  const [entries, setEntries] = useState(props.entries);
  const [message, setMessage] = useState<string | null>(null);

  function markAttendance(ticketId: string, attendanceStatus: "present" | "excused") {
    setMessage(null);
    startTransition(async () => {
      const response = await fetch("/api/attendance/teacher-magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken: props.accessToken,
          sessionId: props.sessionId ?? null,
          eventDate: props.eventDate ?? null,
          ticketId,
          attendanceStatus,
          room: props.room ?? null,
          instructorName: props.instructorName ?? null,
        }),
      });

      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        checkedInAt?: string | null;
        attendanceStatus?: "present" | "excused" | "absent";
      };
      if (!response.ok || !data.ok) {
        setMessage(data.error ?? "Check-in konnte nicht gespeichert werden.");
        return;
      }

      setEntries((current) =>
        current.map((entry) =>
          entry.ticketId === ticketId
            ? {
                ...entry,
                attendanceStatus: data.attendanceStatus ?? attendanceStatus,
                markedAt: data.checkedInAt ?? new Date().toISOString(),
              }
            : entry
        )
      );
    });
  }

  return (
    <section className="space-y-4">
      {message ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p>
      ) : null}

      {entries.length === 0 ? (
        <section className="rounded-2xl border p-5 text-sm text-muted-foreground">
          Für dieses Angebot wurden noch keine Tickets gefunden.
        </section>
      ) : (
        <div className="overflow-hidden rounded-2xl border">
          <div className="grid grid-cols-[1fr_1fr_auto] gap-3 border-b bg-muted px-4 py-3 text-xs font-semibold uppercase text-muted-foreground">
            <span>Vorname</span>
            <span>Nachname</span>
            <span>Status</span>
          </div>
          {entries.map((entry) => {
            const isPresent = entry.attendanceStatus === "present";
            const isExcused = entry.attendanceStatus === "excused";
            const statusLabel =
              entry.attendanceStatus === "present"
                ? "Anwesend"
                : entry.attendanceStatus === "excused"
                  ? "Entschuldigt"
                  : entry.attendanceStatus === "unexcused"
                    ? "Unentschuldigt"
                    : "Offen";
            return (
              <div key={entry.id} className="grid grid-cols-[1fr_1fr_auto] items-center gap-3 border-b px-4 py-3 text-sm last:border-b-0">
                <span className="min-w-0 truncate">{entry.firstName}</span>
                <span className="min-w-0 truncate">{entry.lastName}</span>
                <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center">
                  <span className={isPresent ? "text-green-700" : isExcused ? "text-red-700" : "text-muted-foreground"}>
                    {statusLabel}
                    {entry.markedAt ? ` · ${formatDateTime(entry.markedAt)}` : ""}
                  </span>
                  <button
                    type="button"
                    disabled={pending || !props.checkInEnabled || isPresent}
                    onClick={() => markAttendance(entry.ticketId, "present")}
                    className="rounded-xl border border-green-300 bg-green-50 px-3 py-2 text-xs font-semibold text-green-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Anwesend
                  </button>
                  <button
                    type="button"
                    disabled={pending || !props.checkInEnabled || isExcused}
                    onClick={() => markAttendance(entry.ticketId, "excused")}
                    className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Entschuldigt
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
