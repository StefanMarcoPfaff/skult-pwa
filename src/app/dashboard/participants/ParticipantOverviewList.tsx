"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useMemo, useRef, useState, useTransition, type KeyboardEvent, type ReactNode } from "react";
import { ConfirmIconAction } from "@/app/dashboard/courses/ConfirmIconAction";
import { OfferActionIcon } from "@/app/dashboard/courses/OfferActionIcon";
import { MailActionLink } from "@/components/dashboard/MailActionLink";
import DashboardEmptyState from "../_components/DashboardEmptyState";
import SortableTableHeader, { type SortDirection } from "../_components/SortableTableHeader";
import { archiveParticipantAction } from "./actions";
import { getParticipantStatusPresentation, type ParticipantStatusSource } from "./participant-status-ui";
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
  playLabel?: string;
  playClassName: string;
  pauseClassName: string;
  stopClassName: string;
  pauseLabel?: string;
  stopLabel?: string;
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

type CardPresentation = {
  articleClassName: string;
  badge: {
    label: string;
    className: string;
  };
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

export type ParticipantStatusFilter = "all" | "active" | "paused" | "ended";

type SortKey = "date" | "name" | "offer" | "status";

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function getCardPresentation(item: ParticipantOverviewItem, checkedInAt: string | null): CardPresentation {
  const presentation = getParticipantStatusPresentation(item.status, checkedInAt);
  return {
    articleClassName: presentation.cardClassName,
    badge: {
      label: presentation.badgeLabel,
      className: presentation.badgeClassName,
    },
  };
}

function getCheckInSummary(item: ParticipantOverviewItem, checkedInAt: string | null) {
  if (!item.checkIn) return "Nicht eincheckbar";
  if (checkedInAt) return `Eingecheckt am ${formatDateTime(checkedInAt)}`;
  if (!item.checkIn.enabled) return item.checkIn.disabledReason ?? "Nicht eincheckbar";
  return "Noch nicht eingecheckt";
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
    <div className="flex min-w-[4.5rem] max-w-[5.5rem] flex-col items-center gap-2 text-center">
      {props.children}
      <span className="text-[11px] font-medium leading-4 text-muted-foreground">{props.label}</span>
    </div>
  );
}

function ActionGroup(props: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2 rounded-2xl border border-white/70 bg-white/70 p-3 backdrop-blur-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{props.title}</p>
      <ActionZone>{props.children}</ActionZone>
    </div>
  );
}

function EditAction(props: { href: string }) {
  return (
    <ActionItem label="Notizen">
      <Link href={props.href} className="inline-flex" title="Notizen" aria-label="Notizen">
        <OfferActionIcon title="Notizen" label="Notizen">
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
        title={
          isDone
            ? "Bereits eingecheckt"
            : !resolvedCheckIn.enabled
              ? resolvedCheckIn.disabledReason ?? "Nicht eincheckbar"
              : "Einchecken"
        }
        aria-label={
          isDone
            ? "Bereits eingecheckt"
            : !resolvedCheckIn.enabled
              ? resolvedCheckIn.disabledReason ?? "Nicht eincheckbar"
              : "Einchecken"
        }
      >
        <OfferActionIcon
          title={
            isDone
              ? "Bereits eingecheckt"
              : !resolvedCheckIn.enabled
                ? resolvedCheckIn.disabledReason ?? "Nicht eincheckbar"
                : "Einchecken"
          }
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
        playLabel={props.action.playLabel}
        playClassName={props.action.playClassName}
        pauseClassName={props.action.pauseClassName}
        stopClassName={props.action.stopClassName}
        pauseLabel={props.action.pauseLabel}
        stopLabel={props.action.stopLabel}
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

export function ParticipantOverviewList(props: {
  items: ParticipantOverviewItem[];
  statusFilter: ParticipantStatusFilter;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
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
  const visibleItems = useMemo(() => {
    const items = props.items.filter((item) => {
      const haystack = [item.displayName, item.email ?? "", item.offerTitle].join(" ").toLowerCase();
      if (normalizedQuery && !haystack.includes(normalizedQuery)) return false;

      if (props.statusFilter === "all") return true;
      if (props.statusFilter === "active") {
        if (item.status.kind === "registered") return (item.status.subscriptionStatus ?? "active") === "active";
        if (item.status.kind === "workshop") return item.status.bookingStatus === "paid";
        return item.status.kind === "trial" && item.status.decisionStatus === "approved";
      }
      if (props.statusFilter === "paused") {
        return (
          item.status.kind === "registered" &&
          ["paused", "pause_scheduled"].includes(item.status.subscriptionStatus ?? "")
        );
      }
      if (props.statusFilter === "ended") {
        if (item.status.kind === "trial") {
          return Boolean(item.status.cancelledAt) || item.status.decisionStatus === "rejected";
        }
        if (item.status.kind === "registered") {
          return ["cancel_scheduled", "cancelled", "inactive"].includes(item.status.subscriptionStatus ?? "");
        }
        return item.status.bookingStatus !== "paid";
      }
      return true;
    });

    const directionFactor = sortDirection === "asc" ? 1 : -1;

    items.sort((left, right) => {
      if (sortKey === "name") {
        return left.displayName.localeCompare(right.displayName, "de", { sensitivity: "base" }) * directionFactor;
      }

      if (sortKey === "status") {
        return (
          left.statusLabel.localeCompare(right.statusLabel, "de", { sensitivity: "base" }) * directionFactor ||
          right.sortDate.localeCompare(left.sortDate) * directionFactor
        );
      }

      if (sortKey === "offer") {
        return (
          left.offerTitle.localeCompare(right.offerTitle, "de", { sensitivity: "base" }) * directionFactor ||
          left.displayName.localeCompare(right.displayName, "de", { sensitivity: "base" }) * directionFactor
        );
      }

      const leftPriority = left.highlight ? 0 : 1;
      const rightPriority = right.highlight ? 0 : 1;
      if (leftPriority !== rightPriority) return (leftPriority - rightPriority) * directionFactor;
      return right.sortDate.localeCompare(left.sortDate) * directionFactor;
    });

    return items;
  }, [normalizedQuery, props.items, props.statusFilter, sortDirection, sortKey]);

  function toggleSort(nextKey: SortKey) {
    if (nextKey === sortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextKey);
    setSortDirection(nextKey === "date" ? "desc" : "asc");
  }

  return (
    <section className="space-y-5">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <label className="grid gap-2 text-sm">
            <span className="font-medium text-slate-900">Suche</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Name, E-Mail oder Angebot"
              className="min-h-11 rounded-2xl border border-slate-200 px-4 py-3"
            />
          </label>
          <div className="grid gap-2 text-sm">
            <span className="font-medium text-slate-900">Sortierung</span>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <SortableTableHeader
                label="Datum"
                active={sortKey === "date"}
                direction={sortDirection}
                onToggle={() => toggleSort("date")}
              />
              <SortableTableHeader
                label="Teilnehmer*in"
                active={sortKey === "name"}
                direction={sortDirection}
                onToggle={() => toggleSort("name")}
              />
              <SortableTableHeader
                label="Angebot"
                active={sortKey === "offer"}
                direction={sortDirection}
                onToggle={() => toggleSort("offer")}
              />
              <SortableTableHeader
                label="Status"
                active={sortKey === "status"}
                direction={sortDirection}
                onToggle={() => toggleSort("status")}
              />
            </div>
          </div>
        </div>
      </div>

      {visibleItems.length === 0 ? <DashboardEmptyState title="Keine passenden Teilnehmenden gefunden." /> : null}

      {visibleItems.map((item) => {
        const checkedInAt = checkedInById[item.id] ?? null;
        const presentation = getCardPresentation(item, checkedInAt);
        const checkInSummary = getCheckInSummary(item, checkedInAt);

        return (
          <article
            key={item.id}
            className={`group cursor-pointer rounded-[28px] border p-5 transition hover:border-foreground/20 hover:shadow-sm focus-within:ring-2 focus-within:ring-foreground/20 ${presentation.articleClassName}`}
            tabIndex={0}
            role="link"
            aria-label={`${item.displayName} ansehen`}
            onClick={() => handleNavigate(item.detailHref)}
            onKeyDown={(event) => handleKeyDown(event, item.detailHref)}
          >
            <div className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <h2 className="truncate text-lg font-semibold text-slate-950">{item.displayName}</h2>
                  <p className="text-sm text-muted-foreground">
                    {item.offerKindLabel} · {item.offerTitle}
                  </p>
                </div>
                <span
                  className={`inline-flex w-fit shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${presentation.badge.className}`}
                >
                  {presentation.badge.label}
                </span>
              </div>

              <div className="grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
                <ActionGroup title="Teilnahmestatus & Verwaltung">
                  <LifecycleActions action={item.lifecycleAction} />
                  <EditAction href={item.detailHref} />
                  <ActionItem label="Archivieren">
                    <ArchiveAction action={item.archiveAction} />
                  </ActionItem>
                </ActionGroup>

                <ActionGroup title="Nutzung & Kommunikation">
                  {item.checkIn ? (
                    <ActionItem label="Check-in">
                      <CheckInAction item={item} checkedInAt={checkedInAt} onCheckedIn={handleCheckedIn} />
                    </ActionItem>
                  ) : null}
                  <ActionItem label="Anschreiben">
                    <MailActionLink
                      href={item.mailHref}
                      title="Anschreiben"
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
                </ActionGroup>
              </div>

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
