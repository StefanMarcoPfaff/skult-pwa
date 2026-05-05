"use client";

import Link from "next/link";
import { MailActionLink } from "@/components/dashboard/MailActionLink";
import type { CourseStatus } from "@/lib/course-lifecycle-shared";
import { ConfirmIconAction } from "../ConfirmIconAction";
import { OfferActionIcon, OfferActionItem } from "../OfferActionIcon";
import { ShareEmbedDialog } from "../ShareEmbedDialog";
import { DISABLED_OFFER_ACTION_ICON_CLASS, getDisplayStatus } from "../display-status";
import {
  cancelWorkshopAction,
  scheduleCoursePauseAction,
  scheduleCourseStopAction,
  setCoursePublishStateAction,
} from "./actions";
import { PauseCourseModal, StopCourseModal } from "./CourseLifecycleModal";

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
  publishBlockedForMissingPolicy: boolean;
  contactMailHref: string | null;
};

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

  return (
    <section className="mt-6 rounded-2xl border p-5">
      <div className="flex flex-wrap gap-4">
        <OfferActionItem label="Play">
          {props.normalizedStatus === "draft" ? (
            <ConfirmIconAction
              action={setCoursePublishStateAction}
              fields={{ course_id: props.courseId, mode: "play" }}
              title="Angebot veroeffentlichen?"
              text="Moechtest du dieses Angebot jetzt veroeffentlichen? Danach ist es oeffentlich sichtbar und kann gebucht werden."
              cancelLabel="Nein, abbrechen"
              confirmLabel="Ja, veroeffentlichen"
              disabled={playActionDisabled}
              triggerLabel="veroeffentlichen / starten"
              trigger={
                <OfferActionIcon title="veroeffentlichen / starten" label="veroeffentlichen / starten" className={playIconClassName} disabled={playActionDisabled}>
                  <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                    <path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l10-6.86a1 1 0 0 0 0-1.72l-10-6.86a1 1 0 0 0-1.5.86Z" />
                  </svg>
                </OfferActionIcon>
              }
            />
          ) : (
            <OfferActionIcon
              title="veroeffentlicht / aktiv"
              label="veroeffentlicht / aktiv"
              className={displayState.playClassName}
              disabled={true}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                <path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l10-6.86a1 1 0 0 0 0-1.72l-10-6.86a1 1 0 0 0-1.5.86Z" />
              </svg>
            </OfferActionIcon>
          )}
        </OfferActionItem>

        {props.kind === "course" ? (
          <OfferActionItem label="Pause">
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
                <OfferActionIcon title="pausieren" label="pausieren" className={displayState.pauseClassName} disabled={displayState.pauseDisabled}>
                  <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                    <path d="M7 5.5A1.5 1.5 0 0 1 8.5 4h1A1.5 1.5 0 0 1 11 5.5v13A1.5 1.5 0 0 1 9.5 20h-1A1.5 1.5 0 0 1 7 18.5v-13Zm6 0A1.5 1.5 0 0 1 14.5 4h1A1.5 1.5 0 0 1 17 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-1A1.5 1.5 0 0 1 13 18.5v-13Z" />
                  </svg>
                </OfferActionIcon>
              }
            />
          </OfferActionItem>
        ) : null}

        <OfferActionItem label="Stop">
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
                <OfferActionIcon title="beenden" label="beenden" className={displayState.stopClassName} disabled={displayState.stopDisabled}>
                  <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                    <path d="M7 7.5A1.5 1.5 0 0 1 8.5 6h7A1.5 1.5 0 0 1 17 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 16.5v-9Z" />
                  </svg>
                </OfferActionIcon>
              }
            />
          ) : !displayState.stopDisabled ? (
            <ConfirmIconAction
              action={cancelWorkshopAction}
              fields={{ course_id: props.courseId, redirect_to: props.redirectTo }}
              title="Workshop absagen?"
              text="Wenn du diesen Workshop absagst, wird er nicht mehr oeffentlich angezeigt. Bereits angemeldete Teilnehmer*innen erhalten eine Nachricht. Falls Zahlungen vorliegen, muessen Rueckerstattungen gemaess der bestehenden Refund-Logik ausgeloest werden."
              cancelLabel="Nein, abbrechen"
              confirmLabel="Ja, Workshop absagen"
              triggerLabel="workshop absagen"
              trigger={
                <OfferActionIcon title="beenden" label="beenden" className={displayState.stopClassName}>
                  <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                    <path d="M7 7.5A1.5 1.5 0 0 1 8.5 6h7A1.5 1.5 0 0 1 17 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 16.5v-9Z" />
                  </svg>
                </OfferActionIcon>
              }
            />
          ) : (
            <OfferActionIcon title="beendet" label="beendet" className={displayState.stopClassName} disabled={true}>
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                <path d="M7 7.5A1.5 1.5 0 0 1 8.5 6h7A1.5 1.5 0 0 1 17 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 16.5v-9Z" />
              </svg>
            </OfferActionIcon>
          )}
        </OfferActionItem>

        <OfferActionItem label="Bearbeiten">
          <Link href={`/dashboard/courses/${props.courseId}/edit`} className="inline-flex">
            <OfferActionIcon title="bearbeiten" label="bearbeiten">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                <path d="m4 20 4.5-1 9-9a2.12 2.12 0 1 0-3-3l-9 9L4 20Z" />
                <path d="M13.5 6.5 17.5 10.5" />
              </svg>
            </OfferActionIcon>
          </Link>
        </OfferActionItem>

        <OfferActionItem label="Teilen">
          <ShareEmbedDialog
            isEnabled={props.publicOfferEnabled}
            publicUrl={props.publicUrl}
            embedUrl={props.embedUrl}
            triggerLabel="teilen"
            trigger={
              <OfferActionIcon title="teilen" label="teilen">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                  <path d="M10 13a5 5 0 0 0 7.07 0l2.12-2.12a5 5 0 0 0-7.07-7.07L10.7 5.22" />
                  <path d="M14 11a5 5 0 0 0-7.07 0L4.8 13.12a5 5 0 0 0 7.07 7.07l1.41-1.41" />
                </svg>
              </OfferActionIcon>
            }
          />
        </OfferActionItem>

        <OfferActionItem label="Check-in">
          <Link href={`/dashboard/courses/${props.courseId}/check-in`} className="inline-flex">
            <OfferActionIcon title="Check-in starten" label="Check-in starten">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                <path d="M4 7h16" />
                <path d="M7 4v6" />
                <path d="M17 4v6" />
                <rect x="4" y="6" width="16" height="14" rx="2" />
                <path d="m9 14 2 2 4-4" />
              </svg>
            </OfferActionIcon>
          </Link>
        </OfferActionItem>

        <MailActionLink
          href={props.contactMailHref}
          label="E-Mail"
          title="Teilnehmer*innen per E-Mail kontaktieren"
          disabledHint="Keine E-Mail-Adressen fuer dieses Angebot vorhanden"
        />

      </div>
    </section>
  );
}
