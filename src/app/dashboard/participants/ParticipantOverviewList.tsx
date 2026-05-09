"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition, type KeyboardEvent, type ReactNode } from "react";
import { ConfirmIconAction } from "@/app/dashboard/courses/ConfirmIconAction";
import { OfferActionIcon } from "@/app/dashboard/courses/OfferActionIcon";
import { MailActionLink } from "@/components/dashboard/MailActionLink";
import { archiveParticipantAction } from "./actions";
import {
  RegisteredParticipantLifecycleButtons,
  TrialParticipantLifecycleButtons,
  WorkshopParticipantLifecycleButtons,
} from "./ParticipantLifecycleButtons";

type TrialLifecycleAction = {
  kind: "trial";
  reservationId: string;
  redirectTo: string;
  playClassName: string;
  pauseClassName: string;
  stopClassName: string;
  playDisabled: boolean;
  stopDisabled: boolean;
  showApprovalAction: boolean;
  showCancellationAction: boolean;
};

type RegisteredLifecycleAction = {
  kind: "registered";
  reservationId: string;
  redirectTo: string;
  defaultActiveUntilDate: string;
  defaultPauseEndDate?: string | null;
  defaultStopDate: string;
  playClassName: string;
  pauseClassName: string;
  stopClassName: string;
  pauseDisabled: boolean;
  stopDisabled: boolean;
};

type WorkshopLifecycleAction = {
  kind: "workshop";
  playClassName: string;
  pauseClassName: string;
  stopClassName: string;
};

type ParticipantLifecycleAction =
  | TrialLifecycleAction
  | RegisteredLifecycleAction
  | WorkshopLifecycleAction;

type TrialStatusSource = {
  kind: "trial";
  decisionStatus: string | null;
  cancelledAt: string | null;
};

type RegisteredStatusSource = {
  kind: "registered";
  subscriptionStatus: string | null;
};

type WorkshopStatusSource = {
  kind: "workshop";
  bookingStatus: string | null;
};

type ParticipantStatusSource = TrialStatusSource | RegisteredStatusSource | WorkshopStatusSource;

type ParticipantCheckIn = {
  courseId: string;
  sessionId: string | null;
  eventDate: string;
  ticketId: string;
  room: string | null;
  instructorName: string | null;
  scanHref: string;
  showHref: string;
  enabled: boolean;
  disabledReason: string | null;
  checkedInAt: string | null;
};

type ParticipantArchiveAction = {
  participantId: string;
  source: "trial" | "registered" | "workshop";
  redirectTo: string;
  title: string;
  text: string;
  allowed: boolean;
  reason: string;
};

type ParticipantCalendarAction = {
  href: string | null;
  disabledReason: string | null;
};

export type ParticipantOverviewItem = {
  id: string;
  detailHref: string;
  displayName: string;
  email: string | null;
  offerTitle: string;
  offerKindLabel: string;
  sourceLabel: string;
  metaLabel: string | null;
  decisionInfo: string | null;
  highlight: boolean;
  status: ParticipantStatusSource;
  statusLabel: string;
  mailHref: string | null;
  calendarAction: ParticipantCalendarAction;
  lifecycleAction: ParticipantLifecycleAction;
  checkIn: ParticipantCheckIn | null;
  archiveAction: ParticipantArchiveAction;
  sortDate: string;
};

type StatusFilterValue =
  | "all"
  | "not_checked_in"
  | "checked_in"
  | "decision_open"
  | "active"
  | "paused"
  | "stopped";

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function getStatusBadge(status: ParticipantStatusSource, checkedInAt: string | null) {
  if (status.kind === "trial") {
    if (status.cancelledAt || status.decisionStatus === "rejected") {
      return {
        label: "Gekündigt / gestoppt",
        className: "border-red-200 bg-red-50 text-red-700",
      };
    }

    if ((status.decisionStatus ?? "pending") === "pending" && checkedInAt) {
      return {
        label: "Entscheidung offen",
        className: "border-amber-200 bg-amber-50 text-amber-800",
      };
    }

    if (status.decisionStatus === "approved") {
      return {
        label: "Aktiv",
        className: "border-green-200 bg-green-50 text-green-700",
      };
    }

    return {
      label: "Nicht eingecheckt",
      className: "border-slate-200 bg-slate-50 text-slate-700",
    };
  }

  if (status.kind === "registered") {
    if (status.subscriptionStatus === "paused" || status.subscriptionStatus === "pause_scheduled") {
      return {
        label: "Pausiert",
        className: "border-orange-200 bg-orange-50 text-orange-800",
      };
    }

    if (status.subscriptionStatus === "cancel_scheduled" || status.subscriptionStatus === "cancelled") {
      return {
        label: "Gekündigt / gestoppt",
        className: "border-red-200 bg-red-50 text-red-700",
      };
    }

    if (checkedInAt) {
      return {
        label: "Eingecheckt",
        className: "border-emerald-200 bg-emerald-50 text-emerald-700",
      };
    }

    return {
      label: "Aktiv",
      className: "border-green-200 bg-green-50 text-green-700",
    };
  }

  if (checkedInAt) {
    return {
      label: "Eingecheckt",
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  }

  if (status.bookingStatus === "paid") {
    return {
      label: "Aktiv",
      className: "border-green-200 bg-green-50 text-green-700",
    };
  }

  return {
    label: "Gekündigt / gestoppt",
    className: "border-red-200 bg-red-50 text-red-700",
  };
}

function getCheckInSummary(item: ParticipantOverviewItem, checkedInAt: string | null) {
  if (!item.checkIn) return "Nicht eincheckbar";
  if (checkedInAt) return `Eingecheckt am ${formatDateTime(checkedInAt)}`;
  if (!item.checkIn.enabled) return item.checkIn.disabledReason ?? "Nicht eincheckbar";
  return "Noch nicht eingecheckt";
}

function PlayGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
      <path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l10-6.86a1 1 0 0 0 0-1.72l-10-6.86a1 1 0 0 0-1.5.86Z" />
    </svg>
  );
}

function PauseGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
      <path d="M7 5.5A1.5 1.5 0 0 1 8.5 4h1A1.5 1.5 0 0 1 11 5.5v13A1.5 1.5 0 0 1 9.5 20h-1A1.5 1.5 0 0 1 7 18.5v-13Zm6 0A1.5 1.5 0 0 1 14.5 4h1A1.5 1.5 0 0 1 17 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-1A1.5 1.5 0 0 1 13 18.5v-13Z" />
    </svg>
  );
}

function StopGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
      <path d="M7 7.5A1.5 1.5 0 0 1 8.5 6h7A1.5 1.5 0 0 1 17 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 16.5v-9Z" />
    </svg>
  );
}

function CheckGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
      <path d="m5 13 4 4L19 7" />
    </svg>
  );
}

function FilterIcon(props: { kind: StatusFilterValue }) {
  if (props.kind === "active" || props.kind === "decision_open") return <PlayGlyph />;
  if (props.kind === "paused") return <PauseGlyph />;
  if (props.kind === "stopped") return <StopGlyph />;
  if (props.kind === "checked_in") return <CheckGlyph />;
  return null;
}

function FilterChip(props: {
  active: boolean;
  tone: "neutral" | "green" | "orange" | "red" | "emerald" | "amber";
  label: string;
  icon?: ReactNode;
  onClick: () => void;
}) {
  const toneClasses =
    props.tone === "green"
      ? props.active
        ? "border-green-600 bg-green-600 text-white"
        : "border-green-200 bg-green-50 text-green-800 hover:border-green-300"
      : props.tone === "orange"
        ? props.active
          ? "border-orange-500 bg-orange-500 text-white"
          : "border-orange-200 bg-orange-50 text-orange-800 hover:border-orange-300"
        : props.tone === "red"
          ? props.active
            ? "border-red-600 bg-red-600 text-white"
            : "border-red-200 bg-red-50 text-red-800 hover:border-red-300"
          : props.tone === "emerald"
            ? props.active
              ? "border-emerald-600 bg-emerald-600 text-white"
              : "border-emerald-200 bg-emerald-50 text-emerald-800 hover:border-emerald-300"
            : props.tone === "amber"
              ? props.active
                ? "border-amber-500 bg-amber-500 text-white"
                : "border-amber-200 bg-amber-50 text-amber-800 hover:border-amber-300"
            : props.active
              ? "border-slate-900 bg-slate-900 text-white"
              : "border-slate-200 bg-white text-slate-800 hover:border-slate-300";

  return (
    <button
      type="button"
      onClick={props.onClick}
      className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${toneClasses}`}
    >
      {props.icon ? <span className="inline-flex h-4 w-4 items-center justify-center">{props.icon}</span> : null}
      <span>{props.label}</span>
    </button>
  );
}

function ActionZone(props: { children: ReactNode }) {
  return (
    <div
      className="flex max-w-full flex-wrap items-start gap-2"
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {props.children}
    </div>
  );
}

function ActionItem(props: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-14 flex-col items-center gap-2 text-center">
      {props.children}
      <span className="text-[11px] font-medium leading-4 text-muted-foreground sm:hidden">{props.label}</span>
    </div>
  );
}

function EditAction(props: { href: string }) {
  return (
    <ActionItem label="Bearbeiten">
      <Link href={props.href} className="inline-flex" title="Bearbeiten" aria-label="Bearbeiten">
        <OfferActionIcon title="Bearbeiten" label="Bearbeiten">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
            <path d="m4 20 4.5-1 9-9a2.12 2.12 0 1 0-3-3l-9 9L4 20Z" />
            <path d="M13.5 6.5 17.5 10.5" />
          </svg>
        </OfferActionIcon>
      </Link>
    </ActionItem>
  );
}

function ArchiveGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
      <path d="M4 7h16" />
      <path d="M6 7h12v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7Z" />
      <path d="M9 7V5h6v2" />
    </svg>
  );
}

function ArchiveAction(props: { action: ParticipantArchiveAction }) {
  if (!props.action.allowed) {
    return (
      <span className="inline-flex" title={props.action.reason} aria-label={props.action.reason}>
        <OfferActionIcon
          title={props.action.reason}
          label="Archivieren"
          className="border-slate-200 bg-slate-100 text-slate-400"
          disabled={true}
        >
          <ArchiveGlyph />
        </OfferActionIcon>
      </span>
    );
  }

  return (
    <ConfirmIconAction
      action={archiveParticipantAction}
      fields={{
        participant_id: props.action.participantId,
        source: props.action.source,
        redirect_to: props.action.redirectTo,
      }}
      title={props.action.title}
      text={props.action.text}
      cancelLabel="Nein, abbrechen"
      confirmLabel="Ja, archivieren"
      triggerLabel="archivieren"
      trigger={
        <OfferActionIcon title="Archivieren" label="Archivieren">
          <ArchiveGlyph />
        </OfferActionIcon>
      }
    />
  );
}

function CheckInGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
      <rect x="4" y="6" width="16" height="12" rx="2" />
      <path d="M8 10h4" />
      <path d="m10 14 2 2 4-4" />
    </svg>
  );
}

function CalendarGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
      <path d="M4 7h16" />
      <path d="M7 4v6" />
      <path d="M17 4v6" />
      <rect x="4" y="6" width="16" height="14" rx="2" />
      <path d="M8 11h8" />
      <path d="M8 15h5" />
    </svg>
  );
}

function CheckInAction(props: {
  item: ParticipantOverviewItem;
  checkedInAt: string | null;
  onCheckedIn: (id: string, checkedInAt: string) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const checkIn = props.item.checkIn;

  if (!checkIn) return null;
  const resolvedCheckIn = checkIn;

  const isDone = Boolean(props.checkedInAt);
  const disabled = pending || isDone || !resolvedCheckIn.enabled;
  const className = isDone
    ? "border-emerald-300 bg-emerald-50 text-emerald-700"
    : disabled
      ? "border-slate-200 bg-slate-100 text-slate-400"
      : "border-slate-900 bg-slate-900 text-white";

  function handleManualCheckIn() {
    setMessage(null);

    startTransition(async () => {
      const response = await fetch("/api/attendance/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId: resolvedCheckIn.courseId,
          sessionId: resolvedCheckIn.sessionId,
          eventDate: resolvedCheckIn.eventDate,
          ticketId: resolvedCheckIn.ticketId,
          present: true,
          room: resolvedCheckIn.room,
          instructorName: resolvedCheckIn.instructorName,
        }),
      });

      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        checkedInAt?: string | null;
      };

      if (!response.ok || !data.ok || !data.checkedInAt) {
        setMessage(data.error ?? "Check-in konnte nicht gespeichert werden.");
        return;
      }

      props.onCheckedIn(props.item.id, data.checkedInAt);
      dialogRef.current?.close();
    });
  }

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => dialogRef.current?.showModal()}
        className="disabled:cursor-not-allowed"
        title={isDone ? "Bereits eingecheckt" : !resolvedCheckIn.enabled ? resolvedCheckIn.disabledReason ?? "Nicht eincheckbar" : "Einchecken"}
        aria-label={isDone ? "Bereits eingecheckt" : !resolvedCheckIn.enabled ? resolvedCheckIn.disabledReason ?? "Nicht eincheckbar" : "Einchecken"}
      >
        <OfferActionIcon
          title={isDone ? "Bereits eingecheckt" : !resolvedCheckIn.enabled ? resolvedCheckIn.disabledReason ?? "Nicht eincheckbar" : "Einchecken"}
          label="Einchecken"
          className={className}
          disabled={disabled}
        >
          <CheckInGlyph />
        </OfferActionIcon>
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        className="w-full max-w-lg rounded-2xl border p-0 backdrop:bg-black/30"
      >
        <div className="space-y-4 p-6">
          <div className="space-y-2">
            <h3 id={titleId} className="text-lg font-semibold">
              Teilnehmer*in einchecken
            </h3>
            <p className="text-sm text-muted-foreground">{props.item.displayName}</p>
          </div>

          {message ? (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {message}
            </p>
          ) : null}

          {isDone ? (
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              Bereits eingecheckt am {formatDateTime(props.checkedInAt)}.
            </p>
          ) : (
            <div className="grid gap-3">
              <Link href={resolvedCheckIn.scanHref} className="rounded-2xl border p-4 text-sm transition hover:border-foreground/30">
                <p className="font-semibold">Teilnehmer-QR scannen</p>
                <p className="mt-1 text-muted-foreground">Scanner für den passenden Termin öffnen.</p>
              </Link>
              <Link href={resolvedCheckIn.showHref} className="rounded-2xl border p-4 text-sm transition hover:border-foreground/30">
                <p className="font-semibold">Termin-QR anzeigen</p>
                <p className="mt-1 text-muted-foreground">Session-QR für Selbst-Check-in anzeigen.</p>
              </Link>
              <button
                type="button"
                disabled={pending}
                onClick={handleManualCheckIn}
                className="rounded-2xl border p-4 text-left text-sm transition hover:border-foreground/30 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <p className="font-semibold">{pending ? "Speichert..." : "Manuell einchecken"}</p>
                <p className="mt-1 text-muted-foreground">
                  Für diese konkrete Person direkt als anwesend markieren.
                </p>
              </button>
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              className="rounded-xl border px-4 py-2 text-sm"
              onClick={() => dialogRef.current?.close()}
            >
              Schließen
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}

function LifecycleActions(props: { action: ParticipantLifecycleAction }) {
  if (props.action.kind === "trial") {
    return (
      <TrialParticipantLifecycleButtons
        reservationId={props.action.reservationId}
        redirectTo={props.action.redirectTo}
        playClassName={props.action.playClassName}
        pauseClassName={props.action.pauseClassName}
        stopClassName={props.action.stopClassName}
        playDisabled={props.action.playDisabled}
        stopDisabled={props.action.stopDisabled}
        showApprovalAction={props.action.showApprovalAction}
        showCancellationAction={props.action.showCancellationAction}
      />
    );
  }

  if (props.action.kind === "registered") {
    return (
      <RegisteredParticipantLifecycleButtons
        reservationId={props.action.reservationId}
        redirectTo={props.action.redirectTo}
        defaultActiveUntilDate={props.action.defaultActiveUntilDate}
        defaultPauseEndDate={props.action.defaultPauseEndDate}
        defaultStopDate={props.action.defaultStopDate}
        playClassName={props.action.playClassName}
        pauseClassName={props.action.pauseClassName}
        stopClassName={props.action.stopClassName}
        pauseDisabled={props.action.pauseDisabled}
        stopDisabled={props.action.stopDisabled}
      />
    );
  }

  return (
    <WorkshopParticipantLifecycleButtons
      playClassName={props.action.playClassName}
      pauseClassName={props.action.pauseClassName}
      stopClassName={props.action.stopClassName}
    />
  );
}

export function ParticipantOverviewList(props: { items: ParticipantOverviewItem[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>("all");
  const [sortBy, setSortBy] = useState("date");
  const [checkedInById, setCheckedInById] = useState<Record<string, string | null>>(
    Object.fromEntries(props.items.map((item) => [item.id, item.checkIn?.checkedInAt ?? null]))
  );

  function handleNavigate(href: string) {
    router.push(href);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>, href: string) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    handleNavigate(href);
  }

  function handleCheckedIn(id: string, checkedInAt: string) {
    setCheckedInById((current) => ({ ...current, [id]: checkedInAt }));
  }

  const normalizedQuery = query.trim().toLowerCase();
  const visibleItems = props.items
    .filter((item) => {
      const checkedInAt = checkedInById[item.id] ?? null;
      const haystack = [item.displayName, item.email ?? "", item.offerTitle].join(" ").toLowerCase();
      if (normalizedQuery && !haystack.includes(normalizedQuery)) return false;

      if (statusFilter === "all") return true;
      if (statusFilter === "not_checked_in") return !checkedInAt;
      if (statusFilter === "checked_in") return Boolean(checkedInAt);
      if (statusFilter === "decision_open") {
        return (
          item.status.kind === "trial" &&
          (item.status.decisionStatus ?? "pending") === "pending" &&
          Boolean(checkedInAt)
        );
      }
      if (statusFilter === "active") {
        if (item.status.kind === "registered") return (item.status.subscriptionStatus ?? "active") === "active";
        if (item.status.kind === "workshop") return item.status.bookingStatus === "paid";
        return item.status.kind === "trial" && item.status.decisionStatus === "approved";
      }
      if (statusFilter === "paused") {
        return (
          item.status.kind === "registered" &&
          ["paused", "pause_scheduled"].includes(item.status.subscriptionStatus ?? "")
        );
      }
      if (statusFilter === "stopped") {
        if (item.status.kind === "trial") {
          return Boolean(item.status.cancelledAt) || item.status.decisionStatus === "rejected";
        }
        if (item.status.kind === "registered") {
          return ["cancel_scheduled", "cancelled", "inactive"].includes(item.status.subscriptionStatus ?? "");
        }
        return item.status.bookingStatus !== "paid";
      }
      return true;
    })
    .sort((left, right) => {
      if (sortBy === "name") {
        return left.displayName.localeCompare(right.displayName, "de");
      }
      if (sortBy === "status") {
        return (
          left.statusLabel.localeCompare(right.statusLabel, "de") ||
          right.sortDate.localeCompare(left.sortDate)
        );
      }
      if (sortBy === "offer") {
        return (
          left.offerTitle.localeCompare(right.offerTitle, "de") ||
          left.displayName.localeCompare(right.displayName, "de")
        );
      }

      const leftPriority = left.highlight ? 0 : 1;
      const rightPriority = right.highlight ? 0 : 1;
      if (leftPriority !== rightPriority) return leftPriority - rightPriority;
      return right.sortDate.localeCompare(left.sortDate);
    });

  const filterOptions: Array<{
    value: StatusFilterValue;
    label: string;
    tone: "neutral" | "green" | "orange" | "red" | "emerald" | "amber";
  }> = [
    { value: "all", label: "Alle", tone: "neutral" },
    { value: "active", label: "Aktiv / freigegeben", tone: "green" },
    { value: "paused", label: "Pausiert", tone: "orange" },
    { value: "stopped", label: "Gestoppt / abgelehnt", tone: "red" },
    { value: "decision_open", label: "Entscheidung offen", tone: "amber" },
    { value: "not_checked_in", label: "Nicht eingecheckt", tone: "neutral" },
    { value: "checked_in", label: "Eingecheckt", tone: "emerald" },
  ];

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border p-4">
        <div className="flex flex-wrap gap-2">
          {filterOptions.map((option) => (
            <FilterChip
              key={option.value}
              active={statusFilter === option.value}
              tone={option.tone}
              label={option.label}
              icon={<FilterIcon kind={option.value} />}
              onClick={() => setStatusFilter(option.value)}
            />
          ))}
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1.5fr)_220px]">
          <label className="grid gap-2 text-sm">
            <span className="font-medium">Suche</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Name, E-Mail oder Angebot"
              className="rounded-xl border px-3 py-2"
            />
          </label>
          <label className="grid gap-2 text-sm">
            <span className="font-medium">Sortierung</span>
            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value)}
              className="rounded-xl border px-3 py-2"
            >
              <option value="date">Datum</option>
              <option value="name">Name</option>
              <option value="status">Status</option>
              <option value="offer">Angebot</option>
            </select>
          </label>
        </div>
      </div>

      {visibleItems.length === 0 ? (
        <section className="rounded-2xl border p-6">
          <p className="text-sm text-muted-foreground">
            Für die aktuelle Suche oder Filterung wurden keine Teilnahmen gefunden.
          </p>
        </section>
      ) : null}

      {visibleItems.map((item) => {
        const checkedInAt = checkedInById[item.id] ?? null;
        const badge = getStatusBadge(item.status, checkedInAt);
        const checkInSummary = getCheckInSummary(item, checkedInAt);

        return (
          <article
            key={item.id}
            className={`group cursor-pointer rounded-2xl border p-4 transition hover:border-foreground/20 hover:shadow-sm focus-within:ring-2 focus-within:ring-foreground/20 ${
              item.highlight ? "border-amber-200 bg-amber-50/40" : ""
            }`}
            tabIndex={0}
            role="link"
            aria-label={`${item.displayName} ansehen`}
            onClick={() => handleNavigate(item.detailHref)}
            onKeyDown={(event) => handleKeyDown(event, item.detailHref)}
          >
            <div className="space-y-3">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-lg font-semibold">{item.displayName}</h2>
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${badge.className}`}>
                    {badge.label}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {item.offerKindLabel} · {item.offerTitle}
                </p>
              </div>

              <ActionZone>
                <LifecycleActions action={item.lifecycleAction} />
                <EditAction href={item.detailHref} />
                {item.checkIn ? (
                  <ActionItem label="Check-in">
                    <CheckInAction item={item} checkedInAt={checkedInAt} onCheckedIn={handleCheckedIn} />
                  </ActionItem>
                ) : null}
                <ActionItem label="E-Mail">
                  <MailActionLink
                    href={item.mailHref}
                    title="E-Mail"
                    disabledHint="Keine E-Mail-Adresse für diese Person vorhanden"
                    showLabel={false}
                  />
                </ActionItem>
                <ActionItem label="Kalender">
                  {item.calendarAction.href ? (
                    <Link
                      href={item.calendarAction.href}
                      className="inline-flex"
                      title="Kalenderdatei herunterladen"
                      aria-label="Kalenderdatei herunterladen"
                    >
                      <OfferActionIcon title="Kalenderdatei herunterladen" label="Kalenderdatei herunterladen">
                        <CalendarGlyph />
                      </OfferActionIcon>
                    </Link>
                  ) : (
                    <OfferActionIcon
                      title={item.calendarAction.disabledReason ?? "Kalenderdatei erst mit Termin verfügbar"}
                      label="Kalenderdatei"
                      className="border-slate-200 bg-slate-100 text-slate-400"
                      disabled={true}
                    >
                      <CalendarGlyph />
                    </OfferActionIcon>
                  )}
                </ActionItem>
                <ActionItem label="Archiv">
                  <ArchiveAction action={item.archiveAction} />
                </ActionItem>
              </ActionZone>

              <div className="grid gap-3 text-sm text-muted-foreground md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                <div className="space-y-1">
                  {item.email ? <p className="truncate">{item.email}</p> : null}
                  <p>{item.sourceLabel}</p>
                  {item.metaLabel ? <p>{item.metaLabel}</p> : null}
                </div>
                <div className="space-y-1">
                  <p className="font-medium text-foreground">Check-in</p>
                  <p>{checkInSummary}</p>
                  {item.decisionInfo ? <p>{item.decisionInfo}</p> : null}
                </div>
              </div>
            </div>
          </article>
        );
      })}
    </section>
  );
}
