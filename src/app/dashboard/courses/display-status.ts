import {
  getCourseStatusLabel,
  resolveDashboardCourseStatus,
  type CourseStatus,
} from "@/lib/course-lifecycle-shared";
import { isOneTimeOfferKind } from "@/lib/offer-ui";

export type DashboardOfferView = "all" | "active" | "drafts" | "archive";
export type OfferDisplayStatus = CourseStatus | "cancelled" | "archived";

type OfferStatusInput = {
  kind: string | null;
  status: string | null;
  isPublished: boolean | null;
  endsAt: string | null;
  startsAt?: string | null;
  lastSessionEndsAt?: string | null;
  archivedAt?: string | null;
};

export type OfferActionVisualState = {
  playClassName: string;
  pauseClassName: string;
  stopClassName: string;
  playDisabled: boolean;
  pauseDisabled: boolean;
  stopDisabled: boolean;
  currentStatusLabel: string;
  displayStatus: OfferDisplayStatus;
  view: Exclude<DashboardOfferView, "all">;
};

const DEFAULT_ICON_CLASS = "border-slate-200 bg-background text-slate-600 hover:border-slate-300 hover:text-slate-900";
export const DISABLED_OFFER_ACTION_ICON_CLASS = "border-slate-200 bg-slate-100 text-slate-400";
const ACTIVE_ICON_CLASS = "border-green-600 bg-green-600 text-white";
const PAUSED_ICON_CLASS = "border-orange-500 bg-orange-500 text-white";
const STOPPED_ICON_CLASS = "border-red-600 bg-red-600 text-white";

function getOfferTimelineEnd(input: OfferStatusInput): string | null {
  return input.lastSessionEndsAt ?? input.endsAt ?? input.startsAt ?? null;
}

function hasOneTimeOfferEnded(input: OfferStatusInput): boolean {
  if (!isOneTimeOfferKind(input.kind)) {
    return false;
  }

  const timestampSource = getOfferTimelineEnd(input);
  if (!timestampSource) {
    return false;
  }

  const timestamp = new Date(timestampSource).getTime();
  return Number.isFinite(timestamp) && timestamp < Date.now();
}

function isPublishedStatus(input: OfferStatusInput): boolean {
  const status = String(input.status ?? "").toLowerCase();
  return status === "active" || status === "published" || input.isPublished === true;
}

function getOfferStatusLabel(displayStatus: OfferDisplayStatus): string {
  if (displayStatus === "archived") return "Archiviert";
  if (displayStatus === "cancelled") return "Storniert / Abgesagt";
  return getCourseStatusLabel(displayStatus);
}

export function getOfferStatusBadgeClassName(displayStatus: OfferDisplayStatus): string {
  if (displayStatus === "archived") return "border-slate-200 bg-slate-100 text-slate-700";
  if (
    displayStatus === "cancelled" ||
    displayStatus === "ended" ||
    displayStatus === "stop_scheduled"
  ) {
    return "border-red-200 bg-red-50 text-red-700";
  }
  if (displayStatus === "draft" || displayStatus === "paused" || displayStatus === "pause_scheduled") {
    return "border-orange-200 bg-orange-50 text-orange-800";
  }
  return "border-green-200 bg-green-50 text-green-700";
}

export function getOfferStatusPanelClassName(displayStatus: OfferDisplayStatus): string {
  if (displayStatus === "archived") return "border-slate-200 bg-slate-50/80";
  if (
    displayStatus === "cancelled" ||
    displayStatus === "ended" ||
    displayStatus === "stop_scheduled"
  ) {
    return "border-red-200 bg-red-50/70";
  }
  if (displayStatus === "draft" || displayStatus === "paused" || displayStatus === "pause_scheduled") {
    return "border-orange-200 bg-orange-50/70";
  }
  return "border-green-200 bg-green-50/70";
}

export function getOfferStatusCardClassName(displayStatus: OfferDisplayStatus): string {
  if (displayStatus === "archived") return "border-slate-200 bg-slate-50/80 hover:border-slate-300";
  if (
    displayStatus === "cancelled" ||
    displayStatus === "ended" ||
    displayStatus === "stop_scheduled"
  ) {
    return "border-red-200 bg-red-50/30 hover:border-red-300";
  }
  if (displayStatus === "draft" || displayStatus === "paused" || displayStatus === "pause_scheduled") {
    return "border-orange-200 bg-orange-50/35 hover:border-orange-300";
  }
  return "border-green-200 bg-green-50/25 hover:border-green-300";
}

export function getDisplayStatus(input: OfferStatusInput) {
  const rawStatus = String(input.status ?? "").toLowerCase();
  const displayStatusOverride: OfferDisplayStatus | null =
    input.archivedAt || rawStatus === "archived"
      ? "archived"
      : rawStatus === "cancelled" || rawStatus === "canceled"
        ? "cancelled"
        : null;
  const oneTimeOfferEnded = !displayStatusOverride && hasOneTimeOfferEnded(input) && isPublishedStatus(input);
  const normalizedStatus = resolveDashboardCourseStatus({
    status: oneTimeOfferEnded ? "ended" : input.status,
    isPublished: oneTimeOfferEnded ? false : input.isPublished,
    endsAt: isOneTimeOfferKind(input.kind) && !oneTimeOfferEnded ? null : input.lastSessionEndsAt ?? input.endsAt,
  });
  const displayStatus = displayStatusOverride ?? normalizedStatus;

  let view: Exclude<DashboardOfferView, "all"> = "active";
  if (displayStatus === "draft" || displayStatus === "paused" || displayStatus === "pause_scheduled") {
    view = "drafts";
  } else if (
    displayStatus === "archived" ||
    displayStatus === "cancelled" ||
    displayStatus === "stop_scheduled" ||
    displayStatus === "ended"
  ) {
    view = "archive";
  }

  const pauseDisabled = !(String(input.kind ?? "").toLowerCase() === "course" && ["active", "pause_scheduled"].includes(normalizedStatus));
  const stopDisabled =
    String(input.kind ?? "").toLowerCase() === "course"
      ? !["active", "pause_scheduled", "paused", "stop_scheduled"].includes(normalizedStatus)
      : normalizedStatus === "draft" || normalizedStatus === "ended";
  const playDisabled = normalizedStatus !== "draft";

  const playClassName =
    normalizedStatus === "active"
      ? ACTIVE_ICON_CLASS
      : playDisabled
        ? DISABLED_OFFER_ACTION_ICON_CLASS
        : DEFAULT_ICON_CLASS;
  const pauseClassName =
    normalizedStatus === "paused" || normalizedStatus === "pause_scheduled"
      ? PAUSED_ICON_CLASS
      : pauseDisabled
        ? DISABLED_OFFER_ACTION_ICON_CLASS
        : DEFAULT_ICON_CLASS;
  const stopClassName =
    normalizedStatus === "stop_scheduled" || normalizedStatus === "ended"
      ? STOPPED_ICON_CLASS
      : stopDisabled
        ? DISABLED_OFFER_ACTION_ICON_CLASS
        : DEFAULT_ICON_CLASS;

  return {
    normalizedStatus,
    displayStatus,
    view,
    currentStatusLabel: getOfferStatusLabel(displayStatus),
    playClassName,
    pauseClassName,
    stopClassName,
    playDisabled,
    pauseDisabled,
    stopDisabled,
  } satisfies OfferActionVisualState & { normalizedStatus: ReturnType<typeof resolveDashboardCourseStatus> };
}
