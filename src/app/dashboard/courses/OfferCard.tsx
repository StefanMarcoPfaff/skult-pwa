"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { KeyboardEvent, ReactNode } from "react";
import { ConfirmIconAction } from "./ConfirmIconAction";
import { DuplicateOfferAction } from "./DuplicateOfferAction";
import { archiveCourseAction, setCoursePublishStateAction } from "./[id]/actions";
import { TeacherCheckInShareDialog } from "./[id]/TeacherCheckInShareDialog";
import { CourseCardShareButton } from "./CourseCardShareButton";
import { OfferActionIcon, OfferActionItem } from "./OfferActionIcon";

type OneTimeOfferState = "draft" | "published" | "published_with_bookings" | "ended";
type CourseOfferStatus = "draft" | "active" | "pause_scheduled" | "paused" | "stop_scheduled" | "ended";
type OfferBadgeTone = "green" | "orange" | "red";

export type OfferCardProps = {
  id: string;
  title: string;
  kindLabel: string;
  statusLabel: string;
  normalizedStatus: CourseOfferStatus | null;
  priceLabel: string | null;
  visibilityLabel: string;
  visibility: "public" | "private_link";
  location: string | null;
  locationDetails: string | null;
  capacity: number | null;
  occupiedSeats: number;
  freeSeats: number | null;
  workshopTiming: string | null;
  courseTiming: string | null;
  pauseStartLabel: string | null;
  pauseEndLabel: string | null;
  stopDateLabel: string | null;
  endDateLabel: string | null;
  policyTypeLabel: string;
  policyLabel: string;
  showActivationHint: boolean;
  publicUrl: string;
  embedUrl: string;
  publicOfferEnabled: boolean;
  detailHref: string;
  editHref: string;
  checkInHref: string;
  playIconClass: string;
  pauseIconClass: string;
  stopIconClass: string;
  playDisabled: boolean;
  pauseDisabled: boolean;
  stopDisabled: boolean;
  mailHref: string | null;
  calendarHref: string | null;
  calendarDisabledReason: string | null;
  showMailWarning: boolean;
  archiveAllowed: boolean;
  archiveReason: string;
  oneTimeOfferState: OneTimeOfferState | null;
};

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

function EditGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
      <path d="m4 20 4.5-1 9-9a2.12 2.12 0 1 0-3-3l-9 9L4 20Z" />
      <path d="M13.5 6.5 17.5 10.5" />
    </svg>
  );
}

function DuplicateGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
      <rect x="9" y="9" width="10" height="10" rx="2" />
      <path d="M15 9V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
    </svg>
  );
}

function CheckInGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
      <path d="M4 7h16" />
      <path d="M7 4v6" />
      <path d="M17 4v6" />
      <rect x="4" y="6" width="16" height="14" rx="2" />
      <path d="m9 14 2 2 4-4" />
    </svg>
  );
}

function MailGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
      <path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h13A1.5 1.5 0 0 1 20 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 16.5v-9Z" />
      <path d="m5 7 7 5 7-5" />
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

function ShareGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
      <path d="M10 13a5 5 0 0 0 7.07 0l2.12-2.12a5 5 0 0 0-7.07-7.07L10.7 5.22" />
      <path d="M14 11a5 5 0 0 0-7.07 0L4.8 13.12a5 5 0 0 0 7.07 7.07l1.41-1.41" />
    </svg>
  );
}

function TrashGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
      <path d="M4 7h16" />
      <path d="M9 7V5h6v2" />
      <path d="M7 7l1 12h8l1-12" />
      <path d="M10 11v5" />
      <path d="M14 11v5" />
    </svg>
  );
}

function StatusBadge(props: { tone: OfferBadgeTone; label: string }) {
  const className =
    props.tone === "orange"
      ? "border-orange-200 bg-orange-50 text-orange-800"
      : props.tone === "red"
        ? "border-red-200 bg-red-50 text-red-700"
        : "border-green-200 bg-green-50 text-green-700";

  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${className}`}>{props.label}</span>;
}

function ActionGroupTitle(props: { children: ReactNode }) {
  return <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{props.children}</p>;
}

function OneTimeActionButton(props: {
  label: string;
  title: string;
  icon: ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <OfferActionItem label={props.label}>
      <OfferActionIcon title={props.title} label={props.title} className={props.className} disabled={props.disabled}>
        {props.icon}
      </OfferActionIcon>
    </OfferActionItem>
  );
}

function actionToneClassName(props: { tone?: "green" | "orange" | "red"; active?: boolean; disabled?: boolean }) {
  if (props.disabled && !props.active) {
    return "border-slate-200 bg-slate-100 text-slate-400";
  }

  if (props.tone === "green" && props.active) {
    return "border-green-600 bg-green-600 text-white";
  }

  if (props.tone === "orange" && props.active) {
    return "border-orange-500 bg-orange-500 text-white";
  }

  if (props.tone === "red" && props.active) {
    return "border-red-600 bg-red-600 text-white";
  }

  return undefined;
}

function OneTimeActionItem(props: {
  label: string;
  title: string;
  icon: ReactNode;
  className?: string;
  disabled?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="flex min-w-16 max-w-24 flex-col items-center gap-2 text-center">
      {props.children ?? (
        <OfferActionIcon title={props.title} label={props.title} className={props.className} disabled={props.disabled}>
          {props.icon}
        </OfferActionIcon>
      )}
      <span className={`text-xs font-medium leading-tight ${props.disabled ? "text-slate-400" : "text-muted-foreground"}`}>{props.label}</span>
    </div>
  );
}

function getCourseBadgeLabel(props: OfferCardProps): string {
  if (props.normalizedStatus === "paused" || props.normalizedStatus === "pause_scheduled") {
    if (props.pauseStartLabel && props.pauseEndLabel) {
      return `Laufendes Angebot pausiert von ${props.pauseStartLabel} bis ${props.pauseEndLabel}`;
    }
    return "Laufendes Angebot pausiert";
  }

  if (props.normalizedStatus === "stop_scheduled" || props.normalizedStatus === "ended") {
    const endLabel = props.stopDateLabel ?? props.endDateLabel;
    return endLabel ? `Laufendes Angebot beendet zum ${endLabel}` : "Beendet";
  }

  if (props.normalizedStatus === "active") {
    return "Aktiv";
  }

  return "Entwurf";
}

function getCourseBadgeTone(status: CourseOfferStatus | null): OfferBadgeTone {
  if (status === "draft" || status === "paused" || status === "pause_scheduled") return "orange";
  if (status === "stop_scheduled" || status === "ended") return "red";
  return "green";
}

function CourseActionSections(props: OfferCardProps) {
  const status = props.normalizedStatus ?? "draft";
  const isDraft = status === "draft";
  const isActive = status === "active";
  const isPaused = status === "paused" || status === "pause_scheduled";
  const isEnded = status === "stop_scheduled" || status === "ended";

  const playLabel = isDraft ? "Jetzt veröffentlichen" : isPaused ? "Pause beenden" : isEnded ? "Reaktivieren" : "Veröffentlicht";
  const pauseLabel = isDraft ? "Entwurf" : isPaused ? "Pausiert" : "Pausieren";
  const stopLabel = isEnded ? "Beendet" : "Beenden";
  const deleteLabel = "Löschen";
  const deleteReason = props.archiveReason || "Angebot löschen";
  const playClassName = actionToneClassName({
    tone: "green",
    active: isActive,
    disabled: props.playDisabled,
  }) ?? props.playIconClass;
  const pauseClassName = actionToneClassName({
    tone: "orange",
    active: isDraft || isPaused,
    disabled: props.pauseDisabled && !isDraft && !isPaused,
  }) ?? props.pauseIconClass;
  const stopClassName = actionToneClassName({
    tone: "red",
    active: isEnded,
    disabled: props.stopDisabled && !isEnded,
  }) ?? props.stopIconClass;
  const disableCheckIn = isDraft;

  return (
    <div
      className="space-y-4"
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="space-y-2">
        <ActionGroupTitle>Angebotsstatus & Verwaltung</ActionGroupTitle>
        <div className="flex flex-wrap gap-x-4 gap-y-3">
          {!props.playDisabled ? (
            <ConfirmIconAction
              action={setCoursePublishStateAction}
              fields={{ course_id: props.id, mode: "play", redirect_to: "/dashboard/courses" }}
              title="Angebot jetzt veröffentlichen?"
              text="Nach der Veröffentlichung ist dein Angebot sichtbar und buchbar. Die Sichtbarkeit richtet sich nach der gewählten Sichtbarkeitseinstellung."
              cancelLabel="Nein, abbrechen"
              confirmLabel="Ja, veröffentlichen"
              triggerLabel={playLabel}
              clientAction={true}
              timeoutMs={15000}
              trigger={<OneTimeActionButton label={playLabel} title={playLabel} icon={<PlayGlyph />} className={playClassName} />}
            />
          ) : (
            <OneTimeActionItem label={playLabel} title={playLabel} icon={<PlayGlyph />} className={playClassName} disabled={true} />
          )}

          {isDraft || isPaused ? (
            <OneTimeActionItem label={pauseLabel} title={pauseLabel} icon={<PauseGlyph />} className={pauseClassName} disabled={isPaused} />
          ) : props.pauseDisabled ? (
            <OneTimeActionItem label={pauseLabel} title={pauseLabel} icon={<PauseGlyph />} className={pauseClassName} disabled={true} />
          ) : (
            <Link href={props.detailHref} className="inline-flex" title={pauseLabel} aria-label={pauseLabel}>
              <OneTimeActionItem label={pauseLabel} title={pauseLabel} icon={<PauseGlyph />} className={pauseClassName} />
            </Link>
          )}

          {isEnded ? (
            <OneTimeActionItem label={stopLabel} title={stopLabel} icon={<StopGlyph />} className={stopClassName} disabled={true} />
          ) : props.stopDisabled ? (
            <OneTimeActionItem label={stopLabel} title={stopLabel} icon={<StopGlyph />} className={stopClassName} disabled={true} />
          ) : (
            <Link href={props.detailHref} className="inline-flex" title={stopLabel} aria-label={stopLabel}>
              <OneTimeActionItem label={stopLabel} title={stopLabel} icon={<StopGlyph />} className={stopClassName} />
            </Link>
          )}

          <Link href={props.editHref} className="inline-flex" title="Bearbeiten" aria-label="Bearbeiten">
            <OneTimeActionItem label="Bearbeiten" title="Bearbeiten" icon={<EditGlyph />} />
          </Link>

          <DuplicateOfferAction courseId={props.id}>
            <OneTimeActionItem label="Duplizieren" title="Angebot duplizieren" icon={<DuplicateGlyph />} />
          </DuplicateOfferAction>

          {props.archiveAllowed ? (
            <ConfirmIconAction
              action={archiveCourseAction}
              fields={{ course_id: props.id, redirect_to: "/dashboard/courses" }}
              title="Angebot löschen?"
              text="Das Angebot wird dabei nicht endgültig entfernt, sondern archiviert und aus den aktiven Übersichten ausgeblendet."
              cancelLabel="Nein, abbrechen"
              confirmLabel="Ja, löschen"
              triggerLabel={deleteLabel}
              trigger={<OneTimeActionButton label={deleteLabel} title={deleteLabel} icon={<TrashGlyph />} />}
            />
          ) : (
            <OneTimeActionItem label={deleteLabel} title={deleteReason} icon={<TrashGlyph />} disabled={true} />
          )}
        </div>
      </div>

      <div className="space-y-2 border-t border-slate-200/80 pt-4">
        <ActionGroupTitle>Angebotsnutzung & Kommunikation</ActionGroupTitle>
        <div className="flex flex-wrap gap-x-4 gap-y-3">
          {disableCheckIn ? (
            <OneTimeActionItem label="Check-in" title="Check-in" icon={<CheckInGlyph />} disabled={true} />
          ) : (
            <Link href={props.checkInHref} className="inline-flex" title="Check-in" aria-label="Check-in">
              <OneTimeActionItem label="Check-in" title="Check-in" icon={<CheckInGlyph />} />
            </Link>
          )}

          <TeacherCheckInShareDialog courseId={props.id} />

          {props.mailHref ? (
            <a href={props.mailHref} className="inline-flex" title="E-Mail an Teilnehmende" aria-label="E-Mail an Teilnehmende">
              <OneTimeActionItem label="E-Mail" title="E-Mail an Teilnehmende" icon={<MailGlyph />} />
            </a>
          ) : (
            <OneTimeActionItem label="E-Mail" title="E-Mail an Teilnehmende" icon={<MailGlyph />} disabled={true} />
          )}

          {props.calendarHref ? (
            <Link href={props.calendarHref} className="inline-flex" title="Kalender" aria-label="Kalender">
              <OneTimeActionItem label="Kalender" title="Kalenderdatei herunterladen" icon={<CalendarGlyph />} />
            </Link>
          ) : (
            <OneTimeActionItem
              label="Kalender"
              title={props.calendarDisabledReason ?? "Kalenderdatei erst mit Termin verfügbar"}
              icon={<CalendarGlyph />}
              disabled={true}
            />
          )}

          <CourseCardShareButton
            publicUrl={props.publicUrl}
            embedUrl={props.embedUrl}
            visibility={props.visibility}
            isEnabled={props.publicOfferEnabled}
            triggerLabel="Teilen"
            trigger={<OneTimeActionItem label="Teilen" title="Teilen" icon={<ShareGlyph />} disabled={!props.publicOfferEnabled} />}
          />
        </div>
      </div>
    </div>
  );
}

function OneTimeActionSections(props: OfferCardProps & { state: OneTimeOfferState }) {
  const isDraft = props.state === "draft";
  const isPublished = props.state === "published" || props.state === "published_with_bookings";
  const isPublishedWithBookings = props.state === "published_with_bookings";
  const isEnded = props.state === "ended";

  const publishLabel = isDraft ? "Jetzt veröffentlichen" : "Veröffentlicht";
  const draftLabel = isDraft ? "Entwurf" : "Zurückziehen";
  const deleteReason = props.archiveReason || "Angebot löschen";
  const deleteLabel = "Löschen";
  const canCheckIn = isPublishedWithBookings;
  const playClassName = actionToneClassName({
    tone: "green",
    active: isPublished && !isEnded,
    disabled: props.playDisabled,
  }) ?? props.playIconClass;
  const pauseClassName = actionToneClassName({
    tone: "orange",
    active: isDraft,
    disabled: !isDraft && props.pauseDisabled,
  }) ?? props.pauseIconClass;
  const stopClassName = actionToneClassName({
    tone: "red",
    active: isEnded,
    disabled: props.stopDisabled,
  }) ?? props.stopIconClass;

  return (
    <div
      className="space-y-4"
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="space-y-2">
        <ActionGroupTitle>Angebotsstatus & Verwaltung</ActionGroupTitle>
        <div className="flex flex-wrap gap-x-4 gap-y-3">
          {!props.playDisabled ? (
            <ConfirmIconAction
              action={setCoursePublishStateAction}
              fields={{ course_id: props.id, mode: "play", redirect_to: "/dashboard/courses" }}
              title="Angebot jetzt veröffentlichen?"
              text="Nach der Veröffentlichung ist dein Angebot sichtbar und buchbar. Die Sichtbarkeit richtet sich nach der gewählten Sichtbarkeitseinstellung."
              cancelLabel="Nein, abbrechen"
              confirmLabel="Ja, veröffentlichen"
              triggerLabel={publishLabel}
              clientAction={true}
              timeoutMs={15000}
              trigger={
                <OneTimeActionButton
                  label={publishLabel}
                  title={publishLabel}
                  icon={<PlayGlyph />}
                  className={playClassName}
                />
              }
            />
          ) : (
            <OneTimeActionItem label={publishLabel} title={publishLabel} icon={<PlayGlyph />} className={playClassName} disabled={true} />
          )}

          {isDraft ? (
            <OneTimeActionItem label={draftLabel} title={draftLabel} icon={<PauseGlyph />} className={pauseClassName} />
          ) : props.pauseDisabled ? (
            <OneTimeActionItem label={draftLabel} title={draftLabel} icon={<PauseGlyph />} className={pauseClassName} disabled={true} />
          ) : (
            <Link href={props.detailHref} className="inline-flex" title={draftLabel} aria-label={draftLabel}>
              <OneTimeActionItem label={draftLabel} title={draftLabel} icon={<PauseGlyph />} className={pauseClassName} />
            </Link>
          )}

          {props.stopDisabled ? (
            <OneTimeActionItem label="Stornieren" title="Stornieren" icon={<StopGlyph />} className={stopClassName} disabled={true} />
          ) : (
            <Link href={props.detailHref} className="inline-flex" title="Stornieren" aria-label="Stornieren">
              <OneTimeActionItem label="Stornieren" title="Stornieren" icon={<StopGlyph />} className={stopClassName} />
            </Link>
          )}

          <Link href={props.editHref} className="inline-flex" title="Bearbeiten" aria-label="Bearbeiten">
            <OneTimeActionItem label="Bearbeiten" title="Bearbeiten" icon={<EditGlyph />} />
          </Link>

          <DuplicateOfferAction courseId={props.id}>
            <OneTimeActionItem label="Duplizieren" title="Angebot duplizieren" icon={<DuplicateGlyph />} />
          </DuplicateOfferAction>

          {props.archiveAllowed ? (
            <ConfirmIconAction
              action={archiveCourseAction}
              fields={{ course_id: props.id, redirect_to: "/dashboard/courses" }}
              title="Angebot löschen?"
              text="Das Angebot wird dabei nicht endgültig entfernt, sondern archiviert und aus den aktiven Übersichten ausgeblendet."
              cancelLabel="Nein, abbrechen"
              confirmLabel="Ja, löschen"
              triggerLabel={deleteLabel}
              trigger={<OneTimeActionButton label={deleteLabel} title={deleteLabel} icon={<TrashGlyph />} />}
            />
          ) : (
            <OneTimeActionItem label={deleteLabel} title={deleteReason} icon={<TrashGlyph />} disabled={true} />
          )}
        </div>
      </div>

      <div className="space-y-2 border-t border-slate-200/80 pt-4">
        <ActionGroupTitle>Angebotsnutzung & Kommunikation</ActionGroupTitle>
        <div className="flex flex-wrap gap-x-4 gap-y-3">
          {canCheckIn ? (
            <Link href={props.checkInHref} className="inline-flex" title="Check-in" aria-label="Check-in">
              <OneTimeActionItem label="Check-in" title="Check-in" icon={<CheckInGlyph />} />
            </Link>
          ) : (
            <OneTimeActionItem label="Check-in" title="Check-in" icon={<CheckInGlyph />} disabled={true} />
          )}

          <TeacherCheckInShareDialog courseId={props.id} />

          {props.mailHref && isPublishedWithBookings ? (
            <a href={props.mailHref} className="inline-flex" title="E-Mail an Teilnehmende" aria-label="E-Mail an Teilnehmende">
              <OneTimeActionItem label="E-Mail" title="E-Mail an Teilnehmende" icon={<MailGlyph />} />
            </a>
          ) : (
            <OneTimeActionItem label="E-Mail" title="E-Mail an Teilnehmende" icon={<MailGlyph />} disabled={true} />
          )}

          {props.calendarHref ? (
            <Link href={props.calendarHref} className="inline-flex" title="Kalender" aria-label="Kalender">
              <OneTimeActionItem label="Kalender" title="Kalenderdatei herunterladen" icon={<CalendarGlyph />} />
            </Link>
          ) : (
            <OneTimeActionItem
              label="Kalender"
              title={props.calendarDisabledReason ?? "Kalenderdatei erst mit Termin verfügbar"}
              icon={<CalendarGlyph />}
              disabled={true}
            />
          )}

          <CourseCardShareButton
            publicUrl={props.publicUrl}
            embedUrl={props.embedUrl}
            visibility={props.visibility}
            isEnabled={props.publicOfferEnabled}
            triggerLabel="Teilen"
            trigger={<OneTimeActionItem label="Teilen" title="Teilen" icon={<ShareGlyph />} disabled={!props.publicOfferEnabled && !isPublished} />}
          />
        </div>
      </div>
    </div>
  );
}

export function OfferCard(props: OfferCardProps) {
  const router = useRouter();

  function handleNavigate() {
    router.push(props.detailHref);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    handleNavigate();
  }

  const cardClassName =
    props.oneTimeOfferState === "draft"
      ? "border-orange-200 bg-orange-50/35 hover:border-orange-300"
      : props.oneTimeOfferState === "ended"
        ? "border-red-200 bg-red-50/30 hover:border-red-300"
        : props.oneTimeOfferState
          ? "border-green-200 bg-green-50/25 hover:border-green-300"
          : props.normalizedStatus === "draft" || props.normalizedStatus === "paused" || props.normalizedStatus === "pause_scheduled"
            ? "border-orange-200 bg-orange-50/35 hover:border-orange-300"
            : props.normalizedStatus === "stop_scheduled" || props.normalizedStatus === "ended"
              ? "border-red-200 bg-red-50/30 hover:border-red-300"
              : props.normalizedStatus === "active"
                ? "border-green-200 bg-green-50/25 hover:border-green-300"
                : "hover:border-foreground/20";

  return (
    <article
      className={`group relative cursor-pointer rounded-2xl border p-5 transition hover:shadow-sm focus-within:ring-2 focus-within:ring-foreground/20 ${cardClassName}`}
      onClick={handleNavigate}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="link"
      aria-label={`${props.title} ansehen`}
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">{props.title}</h2>
              <p className="text-sm text-muted-foreground">
                {props.kindLabel}
                {props.priceLabel ? ` · ${props.priceLabel}` : ""}
              </p>
            </div>
            {props.oneTimeOfferState ? (
              <StatusBadge tone={props.oneTimeOfferState === "draft" ? "orange" : props.oneTimeOfferState === "ended" ? "red" : "green"} label={props.statusLabel} />
            ) : props.normalizedStatus ? (
              <StatusBadge tone={getCourseBadgeTone(props.normalizedStatus)} label={getCourseBadgeLabel(props)} />
            ) : null}
          </div>
        </div>

        {props.oneTimeOfferState ? <OneTimeActionSections {...props} state={props.oneTimeOfferState} /> : <CourseActionSections {...props} />}

        <div className="space-y-1 text-sm text-muted-foreground">
          {!props.oneTimeOfferState && !props.normalizedStatus ? <p>Status: {props.statusLabel}</p> : null}
          {props.location || props.locationDetails ? (
            <p>
              Ort: {props.location ?? props.locationDetails}
              {props.location && props.locationDetails ? <span className="block">{props.locationDetails}</span> : null}
            </p>
          ) : null}
          <p>Sichtbarkeit: {props.visibilityLabel}</p>
          {props.capacity !== null ? <p>Max. Teilnehmende: {props.capacity}</p> : null}
          {props.freeSeats !== null ? <p>Freie Plätze: {props.freeSeats}</p> : null}
          {props.capacity !== null ? <p>Reservierungen/Buchungen: {props.occupiedSeats}</p> : null}
          {props.workshopTiming ? <p>{props.workshopTiming}</p> : null}
          {props.courseTiming ? <p>{props.courseTiming}</p> : null}
          {props.pauseStartLabel ? <p>Pausenstart: {props.pauseStartLabel}</p> : null}
          {props.pauseEndLabel ? <p>Pause endet: {props.pauseEndLabel}</p> : null}
          {props.stopDateLabel ? <p>Stopdatum: {props.stopDateLabel}</p> : null}
          <p>
            {props.policyTypeLabel}: {props.policyLabel}
          </p>
          {props.showActivationHint ? (
            <p className="text-red-700">Vor der Aktivierung muss zuerst eine Regel hinterlegt sein.</p>
          ) : null}
          {props.showMailWarning ? (
            <p className="text-amber-700">
              Bei sehr großen Gruppen kann dein E-Mail-Programm die Empfängerliste möglicherweise nicht vollständig übernehmen.
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
}
