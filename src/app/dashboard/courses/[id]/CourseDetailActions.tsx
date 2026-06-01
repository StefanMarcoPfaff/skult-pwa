"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { MailActionLink } from "@/components/dashboard/MailActionLink";
import type { CourseStatus } from "@/lib/course-lifecycle-shared";
import { ConfirmIconAction } from "../ConfirmIconAction";
import { DuplicateOfferAction } from "../DuplicateOfferAction";
import { OfferActionIcon, OfferActionItem } from "../OfferActionIcon";
import { ShareEmbedDialog } from "../ShareEmbedDialog";
import { DISABLED_OFFER_ACTION_ICON_CLASS, getDisplayStatus } from "../display-status";
import {
  archiveCourseAction,
  cancelWorkshopAction,
  scheduleCoursePauseAction,
  scheduleCourseStopAction,
  setCoursePublishStateAction,
} from "./actions";
import { PauseCourseModal, StopCourseModal } from "./CourseLifecycleModal";
import { TeacherCheckInShareDialog } from "./TeacherCheckInShareDialog";

type CourseDetailActionsProps = {
  courseId: string;
  kind: string | null;
  normalizedStatus: string;
  redirectTo: string;
  nextPossiblePauseDate: string;
  pauseStartDate: string | null;
  pauseEndDate: string | null;
  stopDate: string | null;
  publicUrl: string;
  embedUrl: string;
  publicOfferEnabled: boolean;
  visibility: "public" | "private_link";
  visibilityLabel: string;
  publishBlockedForMissingPolicy: boolean;
  contactMailHref: string | null;
  calendarHref: string | null;
  calendarDisabledReason: string | null;
  archiveAllowed: boolean;
  archiveReason: string;
};

function ArchiveGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
      <path d="M4 7h16" />
      <path d="M6 7h12v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7Z" />
      <path d="M9 7V5h6v2" />
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

function ShareGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
      <path d="M10 13a5 5 0 0 0 7.07 0l2.12-2.12a5 5 0 0 0-7.07-7.07L10.7 5.22" />
      <path d="M14 11a5 5 0 0 0-7.07 0L4.8 13.12a5 5 0 0 0 7.07 7.07l1.41-1.41" />
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

function ActionGroup(props: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2 rounded-2xl border border-white/70 bg-white/70 p-3 backdrop-blur-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{props.title}</p>
      <div className="flex flex-wrap gap-4">{props.children}</div>
    </div>
  );
}

export function CourseDetailActions(props: CourseDetailActionsProps) {
  const displayState = getDisplayStatus({
    kind: props.kind,
    status: props.normalizedStatus as CourseStatus,
    isPublished: true,
    endsAt: null,
  });
  const playActionDisabled = props.publishBlockedForMissingPolicy;
  const playIconClassName =
    props.normalizedStatus === "draft" && playActionDisabled
      ? DISABLED_OFFER_ACTION_ICON_CLASS
      : displayState.playClassName;
  const isRunningOffer = props.kind === "course";
  const playLabel =
    props.normalizedStatus === "draft"
      ? "Veröffentlichen"
      : displayState.normalizedStatus === "active"
        ? "Veröffentlicht"
        : displayState.normalizedStatus === "ended" || displayState.normalizedStatus === "stop_scheduled"
          ? "Beendet"
          : "Veröffentlicht";
  const pauseLabel = isRunningOffer
    ? displayState.normalizedStatus === "paused" || displayState.normalizedStatus === "pause_scheduled"
      ? "Pausiert"
      : displayState.normalizedStatus === "draft"
        ? "Entwurf"
        : "Pausieren"
    : displayState.normalizedStatus === "draft"
      ? "Entwurf"
      : "Zurückziehen";
  const stopLabel = isRunningOffer
    ? displayState.normalizedStatus === "ended" || displayState.normalizedStatus === "stop_scheduled"
      ? "Beendet"
      : "Beenden"
    : displayState.normalizedStatus === "ended"
      ? "Storniert"
      : "Stornieren";

  return (
    <section className="mt-6 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <ActionGroup title="Angebotsstatus & Verwaltung">
          <OfferActionItem label={playLabel}>
            {props.normalizedStatus === "draft" ? (
              <ConfirmIconAction
                action={setCoursePublishStateAction}
                fields={{ course_id: props.courseId, mode: "play", redirect_to: props.redirectTo }}
                title="Angebot aktivieren?"
                text={`Möchtest du dieses Angebot jetzt aktivieren? Danach ist es buchbar. Aktuelle Sichtbarkeit: ${props.visibilityLabel}.`}
                cancelLabel="Nein, abbrechen"
                confirmLabel="Ja, aktivieren"
                disabled={playActionDisabled}
                triggerLabel="aktivieren / starten"
                clientAction={true}
                timeoutMs={15000}
                trigger={
                  <OfferActionIcon title={playLabel} label={playLabel} className={playIconClassName} disabled={playActionDisabled}>
                    <PlayGlyph />
                  </OfferActionIcon>
                }
              />
            ) : (
              <OfferActionIcon title={playLabel} label={playLabel} className={displayState.playClassName} disabled={true}>
                <PlayGlyph />
              </OfferActionIcon>
            )}
          </OfferActionItem>

          {props.kind === "course" ? (
            <OfferActionItem label={pauseLabel}>
              <PauseCourseModal
                courseId={props.courseId}
                redirectTo={props.redirectTo}
                nextPossiblePauseDate={props.nextPossiblePauseDate}
                initialPauseStartDate={props.pauseStartDate}
                initialPauseEndDate={props.pauseEndDate}
                action={scheduleCoursePauseAction}
                triggerTitle="pausieren"
                triggerDisabled={displayState.pauseDisabled}
                triggerContent={
                  <OfferActionIcon title={pauseLabel} label={pauseLabel} className={displayState.pauseClassName} disabled={displayState.pauseDisabled}>
                    <PauseGlyph />
                  </OfferActionIcon>
                }
              />
            </OfferActionItem>
          ) : (
            <OfferActionItem label={pauseLabel}>
              <OfferActionIcon title={pauseLabel} label={pauseLabel} className={displayState.pauseClassName} disabled={true}>
                <PauseGlyph />
              </OfferActionIcon>
            </OfferActionItem>
          )}

          <OfferActionItem label={stopLabel}>
            {props.kind === "course" ? (
              <StopCourseModal
                courseId={props.courseId}
                redirectTo={props.redirectTo}
                nextPossibleStopDate={props.nextPossiblePauseDate}
                initialStopDate={props.stopDate}
                action={scheduleCourseStopAction}
                triggerTitle="beenden"
                triggerDisabled={displayState.stopDisabled}
                triggerContent={
                  <OfferActionIcon title={stopLabel} label={stopLabel} className={displayState.stopClassName} disabled={displayState.stopDisabled}>
                    <StopGlyph />
                  </OfferActionIcon>
                }
              />
            ) : !displayState.stopDisabled ? (
              <ConfirmIconAction
                action={cancelWorkshopAction}
                fields={{ course_id: props.courseId, redirect_to: props.redirectTo }}
                title="Einmaliges Angebot absagen?"
                text="Wenn du dieses einmalige Angebot absagst, wird es nicht mehr öffentlich angezeigt. Bereits angemeldete Teilnehmer*innen erhalten eine Nachricht. Falls Zahlungen vorliegen, müssen Rückerstattungen gemäß der bestehenden Refund-Logik ausgelöst werden."
                cancelLabel="Nein, abbrechen"
                confirmLabel="Ja, absagen"
                triggerLabel="absagen"
                trigger={
                  <OfferActionIcon title={stopLabel} label={stopLabel} className={displayState.stopClassName}>
                    <StopGlyph />
                  </OfferActionIcon>
                }
              />
            ) : (
              <OfferActionIcon title={stopLabel} label={stopLabel} className={displayState.stopClassName} disabled={true}>
                <StopGlyph />
              </OfferActionIcon>
            )}
          </OfferActionItem>

          <OfferActionItem label="Bearbeiten">
            <Link href={`/dashboard/courses/${props.courseId}/edit`} className="inline-flex">
              <OfferActionIcon title="Bearbeiten" label="Bearbeiten">
                <EditGlyph />
              </OfferActionIcon>
            </Link>
          </OfferActionItem>

          <OfferActionItem label="Duplizieren">
            <DuplicateOfferAction courseId={props.courseId}>
              <OfferActionIcon title="Angebot duplizieren" label="Angebot duplizieren">
                <DuplicateGlyph />
              </OfferActionIcon>
            </DuplicateOfferAction>
          </OfferActionItem>

          <OfferActionItem label="Archiv">
            {props.archiveAllowed ? (
              <ConfirmIconAction
                action={archiveCourseAction}
                fields={{ course_id: props.courseId, redirect_to: props.redirectTo }}
                title="Angebot archivieren?"
                text="Das Angebot bleibt historisch erhalten und wird nur aus den aktiven Übersichten entfernt."
                cancelLabel="Nein, abbrechen"
                confirmLabel="Ja, archivieren"
                triggerLabel="archivieren"
                trigger={
                  <OfferActionIcon title="Archiv" label="Archiv">
                    <ArchiveGlyph />
                  </OfferActionIcon>
                }
              />
            ) : (
              <OfferActionIcon
                title={props.archiveReason}
                label="Archiv"
                className="border-slate-200 bg-slate-100 text-slate-400"
                disabled={true}
              >
                <ArchiveGlyph />
              </OfferActionIcon>
            )}
          </OfferActionItem>
        </ActionGroup>

        <ActionGroup title="Angebotsnutzung & Kommunikation">
          <OfferActionItem label="Check-in">
            <Link href={`/dashboard/courses/${props.courseId}/check-in`} className="inline-flex">
              <OfferActionIcon title="Check-in starten" label="Check-in starten">
                <CheckInGlyph />
              </OfferActionIcon>
            </Link>
          </OfferActionItem>

          <TeacherCheckInShareDialog courseId={props.courseId} />

          <MailActionLink
            href={props.contactMailHref}
            label="E-Mail"
            title="Teilnehmende per E-Mail kontaktieren"
            disabledHint="Keine E-Mail-Adressen für dieses Angebot vorhanden"
          />

          <OfferActionItem label="Kalender">
            {props.calendarHref ? (
              <Link href={props.calendarHref} className="inline-flex">
                <OfferActionIcon title="Kalenderdatei herunterladen" label="Kalenderdatei herunterladen">
                  <CalendarGlyph />
                </OfferActionIcon>
              </Link>
            ) : (
              <OfferActionIcon
                title={props.calendarDisabledReason ?? "Kalenderdatei erst mit Termin verfügbar"}
                label="Kalenderdatei"
                className="border-slate-200 bg-slate-100 text-slate-400"
                disabled={true}
              >
                <CalendarGlyph />
              </OfferActionIcon>
            )}
          </OfferActionItem>

          <OfferActionItem label="Teilen">
            <ShareEmbedDialog
              isEnabled={props.publicOfferEnabled}
              publicUrl={props.publicUrl}
              embedUrl={props.embedUrl}
              visibility={props.visibility}
              triggerLabel="teilen"
              trigger={
                <OfferActionIcon title="Teilen" label="Teilen">
                  <ShareGlyph />
                </OfferActionIcon>
              }
            />
          </OfferActionItem>
        </ActionGroup>
      </div>
    </section>
  );
}
