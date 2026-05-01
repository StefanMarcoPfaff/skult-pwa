"use client";

import Link from "next/link";
import { ConfirmIconAction } from "../ConfirmIconAction";
import { OfferActionIcon, OfferActionItem } from "../OfferActionIcon";
import { ShareEmbedDialog } from "../ShareEmbedDialog";
import {
  cancelWorkshopAction,
  duplicateCourseAction,
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
};

export function CourseDetailActions(props: CourseDetailActionsProps) {
  const playIconClass =
    props.normalizedStatus === "active"
      ? "border-green-200 text-green-700"
      : "text-muted-foreground hover:text-foreground";
  const pauseIconClass =
    props.normalizedStatus === "paused" || props.normalizedStatus === "pause_scheduled"
      ? "border-orange-200 text-orange-700"
      : "text-muted-foreground hover:text-foreground";
  const stopIconClass =
    props.normalizedStatus === "stop_scheduled" || props.normalizedStatus === "ended"
      ? "border-red-200 text-red-700"
      : "text-muted-foreground hover:text-foreground";

  return (
    <section className="mt-6 rounded-2xl border p-5">
      <div className="flex flex-wrap gap-4">
        <OfferActionItem label={props.normalizedStatus === "draft" ? "Veroeffentlichen" : "Aktiv"}>
          {props.normalizedStatus === "draft" ? (
            <ConfirmIconAction
              action={setCoursePublishStateAction}
              fields={{ course_id: props.courseId, mode: "play" }}
              title="Angebot veroeffentlichen?"
              text="Moechtest du dieses Angebot jetzt veroeffentlichen? Danach ist es oeffentlich sichtbar und kann gebucht werden."
              cancelLabel="Nein, abbrechen"
              confirmLabel="Ja, veroeffentlichen"
              disabled={props.publishBlockedForMissingPolicy}
              triggerLabel="veroeffentlichen / starten"
              trigger={
                <OfferActionIcon title="veroeffentlichen / starten" label="veroeffentlichen / starten" className={playIconClass}>
                  <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                    <path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l10-6.86a1 1 0 0 0 0-1.72l-10-6.86a1 1 0 0 0-1.5.86Z" />
                  </svg>
                </OfferActionIcon>
              }
            />
          ) : (
            <OfferActionIcon title="veroeffentlicht / aktiv" label="veroeffentlicht / aktiv" className={playIconClass}>
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
              triggerDisabled={!(props.normalizedStatus === "active" || props.normalizedStatus === "pause_scheduled")}
              triggerContent={
                <OfferActionIcon title="pausieren" label="pausieren" className={pauseIconClass}>
                  <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                    <path d="M7 5.5A1.5 1.5 0 0 1 8.5 4h1A1.5 1.5 0 0 1 11 5.5v13A1.5 1.5 0 0 1 9.5 20h-1A1.5 1.5 0 0 1 7 18.5v-13Zm6 0A1.5 1.5 0 0 1 14.5 4h1A1.5 1.5 0 0 1 17 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-1A1.5 1.5 0 0 1 13 18.5v-13Z" />
                  </svg>
                </OfferActionIcon>
              }
            />
          </OfferActionItem>
        ) : null}

        <OfferActionItem label={props.kind === "workshop" ? "Absagen" : "Stop"}>
          {props.kind === "course" ? (
            <StopCourseModal
              courseId={props.courseId}
              redirectTo={props.redirectTo}
              nextPossibleStopDate={props.nextPossiblePauseDate}
              initialStopDate={props.stopDate}
              action={scheduleCourseStopAction}
              triggerTitle="beenden"
              triggerDisabled={!["active", "pause_scheduled", "paused", "stop_scheduled"].includes(props.normalizedStatus)}
              triggerContent={
                <OfferActionIcon title="beenden" label="beenden" className={stopIconClass}>
                  <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                    <path d="M7 7.5A1.5 1.5 0 0 1 8.5 6h7A1.5 1.5 0 0 1 17 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 16.5v-9Z" />
                  </svg>
                </OfferActionIcon>
              }
            />
          ) : props.normalizedStatus !== "ended" ? (
            <ConfirmIconAction
              action={cancelWorkshopAction}
              fields={{ course_id: props.courseId, redirect_to: props.redirectTo }}
              title="Workshop absagen?"
              text="Wenn du diesen Workshop absagst, wird er nicht mehr oeffentlich angezeigt. Bereits angemeldete Teilnehmer*innen erhalten eine Nachricht. Falls Zahlungen vorliegen, muessen Rueckerstattungen gemaess der bestehenden Refund-Logik ausgeloest werden."
              cancelLabel="Nein, abbrechen"
              confirmLabel="Ja, Workshop absagen"
              triggerLabel="workshop absagen"
              trigger={
                <OfferActionIcon title="beenden" label="beenden" className={stopIconClass}>
                  <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                    <path d="M7 7.5A1.5 1.5 0 0 1 8.5 6h7A1.5 1.5 0 0 1 17 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 16.5v-9Z" />
                  </svg>
                </OfferActionIcon>
              }
            />
          ) : (
            <OfferActionIcon title="beendet" label="beendet" className={stopIconClass}>
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

        <OfferActionItem label="Kopieren">
          <form action={duplicateCourseAction}>
            <input type="hidden" name="course_id" value={props.courseId} />
            <button type="submit" className="inline-flex" title="kopieren" aria-label="kopieren">
              <OfferActionIcon title="kopieren" label="kopieren">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                  <rect x="9" y="9" width="10" height="10" rx="2" />
                  <path d="M7 15H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1" />
                </svg>
              </OfferActionIcon>
            </button>
          </form>
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
      </div>
    </section>
  );
}
