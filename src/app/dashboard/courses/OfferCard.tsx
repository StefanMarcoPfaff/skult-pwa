"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { KeyboardEvent } from "react";
import { duplicateCourseAction, setCoursePublishStateAction } from "./[id]/actions";
import { CourseCardShareButton } from "./CourseCardShareButton";
import { OfferActionIcon } from "./OfferActionIcon";

export type OfferCardProps = {
  id: string;
  title: string;
  kindLabel: string;
  statusLabel: string;
  location: string | null;
  workshopTiming: string | null;
  courseTiming: string | null;
  pauseStartLabel: string | null;
  pauseEndLabel: string | null;
  stopDateLabel: string | null;
  policyTypeLabel: string;
  policyLabel: string;
  isMissingPolicy: boolean;
  isDraft: boolean;
  publicHref: string;
  detailHref: string;
  editHref: string;
  playIconClass: string;
  pauseIconClass: string;
  stopIconClass: string;
};

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
          {props.isDraft ? (
            <form action={setCoursePublishStateAction}>
              <input type="hidden" name="course_id" value={props.id} />
              <input type="hidden" name="mode" value="play" />
              <input type="hidden" name="redirect_to" value="/dashboard/courses" />
              <button
                type="submit"
                disabled={props.isMissingPolicy}
                title="veroeffentlichen / starten"
                aria-label="veroeffentlichen / starten"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border bg-background text-muted-foreground transition hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                  <path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l10-6.86a1 1 0 0 0 0-1.72l-10-6.86a1 1 0 0 0-1.5.86Z" />
                </svg>
              </button>
            </form>
          ) : (
            <Link href={props.detailHref} className="inline-flex" aria-label="veroeffentlichen / starten">
              <OfferActionIcon title="veroeffentlichen / starten" label="veroeffentlichen / starten" className={props.playIconClass}>
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                  <path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l10-6.86a1 1 0 0 0 0-1.72l-10-6.86a1 1 0 0 0-1.5.86Z" />
                </svg>
              </OfferActionIcon>
            </Link>
          )}
          <Link href={props.detailHref} className="inline-flex" aria-label="pausieren">
            <OfferActionIcon title="pausieren" label="pausieren" className={props.pauseIconClass}>
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                <path d="M7 5.5A1.5 1.5 0 0 1 8.5 4h1A1.5 1.5 0 0 1 11 5.5v13A1.5 1.5 0 0 1 9.5 20h-1A1.5 1.5 0 0 1 7 18.5v-13Zm6 0A1.5 1.5 0 0 1 14.5 4h1A1.5 1.5 0 0 1 17 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-1A1.5 1.5 0 0 1 13 18.5v-13Z" />
              </svg>
            </OfferActionIcon>
          </Link>
          <Link href={props.detailHref} className="inline-flex" aria-label="beenden">
            <OfferActionIcon title="beenden" label="beenden" className={props.stopIconClass}>
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                <path d="M7 7.5A1.5 1.5 0 0 1 8.5 6h7A1.5 1.5 0 0 1 17 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 16.5v-9Z" />
              </svg>
            </OfferActionIcon>
          </Link>
          <Link href={props.editHref} className="inline-flex" title="bearbeiten" aria-label="bearbeiten">
            <OfferActionIcon title="bearbeiten" label="bearbeiten">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                <path d="m4 20 4.5-1 9-9a2.12 2.12 0 1 0-3-3l-9 9L4 20Z" />
                <path d="M13.5 6.5 17.5 10.5" />
              </svg>
            </OfferActionIcon>
          </Link>
          <form action={duplicateCourseAction}>
            <input type="hidden" name="course_id" value={props.id} />
            <button type="submit" className="inline-flex" title="kopieren" aria-label="kopieren">
              <OfferActionIcon title="kopieren" label="kopieren">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                  <rect x="9" y="9" width="10" height="10" rx="2" />
                  <path d="M7 15H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1" />
                </svg>
              </OfferActionIcon>
            </button>
          </form>
          <CourseCardShareButton href={props.publicHref} />
        </div>
      </div>

      <div className="mt-3 space-y-1 text-sm text-muted-foreground">
        {props.location ? <p>Ort: {props.location}</p> : null}
        {props.workshopTiming ? <p>{props.workshopTiming}</p> : null}
        {props.courseTiming ? <p>{props.courseTiming}</p> : null}
        {props.pauseStartLabel ? <p>Pausenstart: {props.pauseStartLabel}</p> : null}
        {props.pauseEndLabel ? <p>Pause endet: {props.pauseEndLabel}</p> : null}
        {props.stopDateLabel ? <p>Stopdatum: {props.stopDateLabel}</p> : null}
        <p>
          {props.policyTypeLabel}: {props.policyLabel}
        </p>
        {props.isDraft && props.isMissingPolicy ? (
          <p className="text-red-700">Vor der Aktivierung muss zuerst eine Regel hinterlegt sein.</p>
        ) : null}
      </div>
    </article>
  );
}
