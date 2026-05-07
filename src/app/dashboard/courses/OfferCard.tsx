"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { KeyboardEvent } from "react";
import { MailActionLink } from "@/components/dashboard/MailActionLink";
import { ConfirmIconAction } from "./ConfirmIconAction";
import { archiveCourseAction, setCoursePublishStateAction } from "./[id]/actions";
import { CourseCardShareButton } from "./CourseCardShareButton";
import { OfferActionIcon } from "./OfferActionIcon";

export type OfferCardProps = {
  id: string;
  title: string;
  kindLabel: string;
  statusLabel: string;
  visibilityLabel: string;
  location: string | null;
  workshopTiming: string | null;
  courseTiming: string | null;
  pauseStartLabel: string | null;
  pauseEndLabel: string | null;
  stopDateLabel: string | null;
  policyTypeLabel: string;
  policyLabel: string;
  showActivationHint: boolean;
  publicHref: string;
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
  showMailWarning: boolean;
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

  return (
    <article
      className="group relative cursor-pointer rounded-2xl border p-5 transition hover:border-foreground/20 hover:shadow-sm focus-within:ring-2 focus-within:ring-foreground/20"
      onClick={handleNavigate}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="link"
      aria-label={`${props.title} ansehen`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{props.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {props.kindLabel} • {props.statusLabel}
          </p>
        </div>
        <div
          className="flex items-center gap-2"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          {!props.playDisabled ? (
            <ConfirmIconAction
              action={setCoursePublishStateAction}
              fields={{ course_id: props.id, mode: "play", redirect_to: "/dashboard/courses" }}
              title="Möchtest du dieses Angebot aktivieren?"
              text="Nach der Aktivierung ist dein Angebot buchbar. Die Sichtbarkeit in Listen richtet sich nach der gewählten Sichtbarkeitseinstellung."
              cancelLabel="Nein, abbrechen"
              confirmLabel="Ja, aktivieren"
              triggerLabel="aktivieren / starten"
              trigger={
                <OfferActionIcon title="aktivieren / starten" label="aktivieren / starten" className={props.playIconClass}>
                  <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                    <path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l10-6.86a1 1 0 0 0 0-1.72l-10-6.86a1 1 0 0 0-1.5.86Z" />
                  </svg>
                </OfferActionIcon>
              }
            />
          ) : (
            <span className="inline-flex">
              <OfferActionIcon
                title="aktivieren / starten"
                label="aktivieren / starten"
                className={props.playIconClass}
                disabled={true}
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                  <path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l10-6.86a1 1 0 0 0 0-1.72l-10-6.86a1 1 0 0 0-1.5.86Z" />
                </svg>
              </OfferActionIcon>
            </span>
          )}
          {props.pauseDisabled ? (
            <span className="inline-flex">
              <OfferActionIcon title="pausieren" label="pausieren" className={props.pauseIconClass} disabled={true}>
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                  <path d="M7 5.5A1.5 1.5 0 0 1 8.5 4h1A1.5 1.5 0 0 1 11 5.5v13A1.5 1.5 0 0 1 9.5 20h-1A1.5 1.5 0 0 1 7 18.5v-13Zm6 0A1.5 1.5 0 0 1 14.5 4h1A1.5 1.5 0 0 1 17 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-1A1.5 1.5 0 0 1 13 18.5v-13Z" />
                </svg>
              </OfferActionIcon>
            </span>
          ) : (
            <Link href={props.detailHref} className="inline-flex" aria-label="pausieren">
              <OfferActionIcon title="pausieren" label="pausieren" className={props.pauseIconClass}>
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                  <path d="M7 5.5A1.5 1.5 0 0 1 8.5 4h1A1.5 1.5 0 0 1 11 5.5v13A1.5 1.5 0 0 1 9.5 20h-1A1.5 1.5 0 0 1 7 18.5v-13Zm6 0A1.5 1.5 0 0 1 14.5 4h1A1.5 1.5 0 0 1 17 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-1A1.5 1.5 0 0 1 13 18.5v-13Z" />
                </svg>
              </OfferActionIcon>
            </Link>
          )}
          {props.stopDisabled ? (
            <span className="inline-flex">
              <OfferActionIcon title="beenden" label="beenden" className={props.stopIconClass} disabled={true}>
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                  <path d="M7 7.5A1.5 1.5 0 0 1 8.5 6h7A1.5 1.5 0 0 1 17 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 16.5v-9Z" />
                </svg>
              </OfferActionIcon>
            </span>
          ) : (
            <Link href={props.detailHref} className="inline-flex" aria-label="beenden">
              <OfferActionIcon title="beenden" label="beenden" className={props.stopIconClass}>
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                  <path d="M7 7.5A1.5 1.5 0 0 1 8.5 6h7A1.5 1.5 0 0 1 17 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 16.5v-9Z" />
                </svg>
              </OfferActionIcon>
            </Link>
          )}
          {props.archiveAllowed ? (
            <ConfirmIconAction
              action={archiveCourseAction}
              fields={{ course_id: props.id, redirect_to: "/dashboard/courses" }}
              title="Angebot archivieren?"
              text="Das Angebot bleibt historisch erhalten und wird nur aus den aktiven Übersichten entfernt."
              cancelLabel="Nein, abbrechen"
              confirmLabel="Ja, archivieren"
              triggerLabel="archivieren"
              trigger={
                <OfferActionIcon title="archivieren" label="archivieren">
                  <ArchiveGlyph />
                </OfferActionIcon>
              }
            />
          ) : (
            <span className="inline-flex" title={props.archiveReason} aria-label={props.archiveReason}>
              <OfferActionIcon
                title={props.archiveReason}
                label="archivieren"
                className="border-slate-200 bg-slate-100 text-slate-400"
                disabled={true}
              >
                <ArchiveGlyph />
              </OfferActionIcon>
            </span>
          )}
          <Link href={props.editHref} className="inline-flex" title="bearbeiten" aria-label="bearbeiten">
            <OfferActionIcon title="bearbeiten" label="bearbeiten">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                <path d="m4 20 4.5-1 9-9a2.12 2.12 0 1 0-3-3l-9 9L4 20Z" />
                <path d="M13.5 6.5 17.5 10.5" />
              </svg>
            </OfferActionIcon>
          </Link>
          <CourseCardShareButton href={props.publicHref} />
          <Link href={props.checkInHref} className="inline-flex" title="Check-in starten" aria-label="Check-in starten">
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
          <MailActionLink
            href={props.mailHref}
            title="Teilnehmer*innen per E-Mail kontaktieren"
            disabledHint="Keine E-Mail-Adressen für dieses Angebot vorhanden"
            showLabel={false}
          />
        </div>
      </div>

      <div className="mt-3 space-y-1 text-sm text-muted-foreground">
        {props.location ? <p>Ort: {props.location}</p> : null}
        <p>Sichtbarkeit: {props.visibilityLabel}</p>
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
    </article>
  );
}
