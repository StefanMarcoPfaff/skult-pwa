"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useId, useRef, useState, useTransition, type KeyboardEvent, type ReactNode } from "react";
import { OfferActionIcon } from "@/app/dashboard/courses/OfferActionIcon";
import { MailActionLink } from "@/components/dashboard/MailActionLink";
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
  mailHref: string | null;
  lifecycleAction: ParticipantLifecycleAction;
  checkIn: ParticipantCheckIn | null;
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

function getStatusBadge(status: ParticipantStatusSource, checkedInAt: string | null) {
  if (status.kind === "trial") {
    if (status.cancelledAt || status.decisionStatus === "rejected") {
      return {
        label: "gekÃ¼ndigt / gestoppt",
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
        label: "verbindlich angemeldet",
        className: "border-green-200 bg-green-50 text-green-700",
      };
    }

    return {
      label: "Probestunde",
      className: "border-slate-200 bg-slate-50 text-slate-700",
    };
  }

  if (status.kind === "registered") {
    if (status.subscriptionStatus === "paused" || status.subscriptionStatus === "pause_scheduled") {
      return {
        label: "pausiert",
        className: "border-orange-200 bg-orange-50 text-orange-800",
      };
    }

    if (status.subscriptionStatus === "cancel_scheduled" || status.subscriptionStatus === "cancelled") {
      return {
        label: "gekÃ¼ndigt / gestoppt",
        className: "border-red-200 bg-red-50 text-red-700",
      };
    }

    if (checkedInAt) {
      return {
        label: "eingecheckt",
        className: "border-emerald-200 bg-emerald-50 text-emerald-700",
      };
    }

    return {
      label: "verbindlich angemeldet",
      className: "border-green-200 bg-green-50 text-green-700",
    };
  }

  if (checkedInAt) {
    return {
      label: "eingecheckt",
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  }

  if (status.bookingStatus === "paid") {
    return {
      label: "verbindlich angemeldet",
      className: "border-green-200 bg-green-50 text-green-700",
    };
  }

  return {
    label: "gekÃ¼ndigt / gestoppt",
    className: "border-red-200 bg-red-50 text-red-700",
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
      className="flex flex-wrap items-center gap-2"
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

function CheckInGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
      <rect x="4" y="6" width="16" height="12" rx="2" />
      <path d="M8 10h4" />
      <path d="m10 14 2 2 4-4" />
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
  const disabled = pending || isDone || !checkIn.enabled;
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
          isDone ? "bereits eingecheckt" : !checkIn.enabled ? checkIn.disabledReason ?? "nicht eincheckbar" : "einchecken"
        }
        aria-label={
          isDone ? "bereits eingecheckt" : !checkIn.enabled ? checkIn.disabledReason ?? "nicht eincheckbar" : "Einchecken"
        }
      >
        <OfferActionIcon
          title={
            isDone ? "bereits eingecheckt" : !checkIn.enabled ? checkIn.disabledReason ?? "nicht eincheckbar" : "Einchecken"
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
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p>
          ) : null}

          {isDone ? (
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              Bereits eingecheckt am {formatDateTime(props.checkedInAt)}.
            </p>
          ) : (
            <div className="grid gap-3">
              <Link href={resolvedCheckIn.scanHref} className="rounded-2xl border p-4 text-sm transition hover:border-foreground/30">
                <p className="font-semibold">Teilnehmer-QR scannen</p>
                <p className="mt-1 text-muted-foreground">Scanner fÃ¼r den passenden Termin Ã¶ffnen.</p>
              </Link>
              <Link href={resolvedCheckIn.showHref} className="rounded-2xl border p-4 text-sm transition hover:border-foreground/30">
                <p className="font-semibold">Termin-QR anzeigen</p>
                <p className="mt-1 text-muted-foreground">Session-QR fÃ¼r Selbst-Check-in anzeigen.</p>
              </Link>
              <button
                type="button"
                disabled={pending}
                onClick={handleManualCheckIn}
                className="rounded-2xl border p-4 text-left text-sm transition hover:border-foreground/30 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <p className="font-semibold">{pending ? "Speichert..." : "Manuell einchecken"}</p>
                <p className="mt-1 text-muted-foreground">
                  FÃ¼r diese konkrete Person direkt als anwesend markieren.
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
              SchlieÃŸen
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

  return (
    <section className="space-y-3">
      {props.items.map((item) => {
        const checkedInAt = checkedInById[item.id] ?? null;
        const badge = getStatusBadge(item.status, checkedInAt);
        const checkInSummary = getCheckInSummary(item, checkedInAt);

        return (
          <article
            key={item.id}
            className={`group rounded-2xl border p-4 transition focus-within:ring-2 focus-within:ring-foreground/20 hover:border-foreground/20 hover:shadow-sm ${
              item.highlight ? "border-amber-200 bg-amber-50/40" : ""
            } cursor-pointer`}
            tabIndex={0}
            role="link"
            aria-label={`${item.displayName} ansehen`}
            onClick={() => handleNavigate(item.detailHref)}
            onKeyDown={(event) => handleKeyDown(event, item.detailHref)}
          >
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] lg:items-center">
              <div className="min-w-0 space-y-2">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-lg font-semibold">{item.displayName}</h2>
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${badge.className}`}>
                      {badge.label}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {item.offerKindLabel} | {item.offerTitle}
                  </p>
                </div>
                <div className="space-y-1 text-sm text-muted-foreground">
                  {item.email ? <p className="truncate">{item.email}</p> : null}
                  <p>{item.sourceLabel}</p>
                  {item.metaLabel ? <p>{item.metaLabel}</p> : null}
                </div>
              </div>

              <div className="space-y-1 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">Check-in</p>
                <p>{checkInSummary}</p>
                {item.decisionInfo ? <p>{item.decisionInfo}</p> : null}
              </div>

              <ActionZone>
                <LifecycleActions action={item.lifecycleAction} />
                <EditAction href={item.detailHref} />
                {item.checkIn ? (
                  <ActionItem label="Einchecken">
                    <CheckInAction item={item} checkedInAt={checkedInAt} onCheckedIn={handleCheckedIn} />
                  </ActionItem>
                ) : null}
                <ActionItem label="E-Mail">
                  <MailActionLink
                    href={item.mailHref}
                    title="E-Mail"
                    disabledHint="Keine E-Mail-Adresse fÃ¼r diese Person vorhanden"
                    showLabel={false}
                  />
                </ActionItem>
              </ActionZone>
            </div>
          </article>
        );
      })}
    </section>
  );
}
