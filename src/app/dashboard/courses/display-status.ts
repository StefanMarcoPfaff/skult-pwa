import {
  getCourseStatusLabel,
  resolveDashboardCourseStatus,
  type CourseStatus,
} from "@/lib/course-lifecycle-shared";

export type DashboardOfferView = "all" | "active" | "drafts" | "archive";

type OfferStatusInput = {
  kind: string | null;
  status: CourseStatus | null;
  isPublished: boolean | null;
  endsAt: string | null;
  startsAt?: string | null;
  lastSessionEndsAt?: string | null;
};

export type OfferActionVisualState = {
  playClassName: string;
  pauseClassName: string;
  stopClassName: string;
  playDisabled: boolean;
  pauseDisabled: boolean;
  stopDisabled: boolean;
  currentStatusLabel: string;
  view: Exclude<DashboardOfferView, "all">;
};

const DEFAULT_ICON_CLASS = "border-slate-200 bg-background text-slate-600 hover:border-slate-300 hover:text-slate-900";
export const DISABLED_OFFER_ACTION_ICON_CLASS = "border-slate-200 bg-slate-100 text-slate-400";
const ACTIVE_ICON_CLASS = "border-green-600 bg-green-600 text-white";
const PAUSED_ICON_CLASS = "border-orange-500 bg-orange-500 text-white";
const STOPPED_ICON_CLASS = "border-red-600 bg-red-600 text-white";

function hasOneTimeOfferEnded(input: OfferStatusInput): boolean {
  const kind = String(input.kind ?? "").toLowerCase();
  if (!["workshop", "exclusive_offer"].includes(kind)) {
    return false;
  }

  const timestampSource = input.lastSessionEndsAt ?? input.endsAt ?? input.startsAt ?? null;
  if (!timestampSource) {
    return false;
  }

  const timestamp = new Date(timestampSource).getTime();
  return Number.isFinite(timestamp) && timestamp < Date.now();
}

export function getDisplayStatus(input: OfferStatusInput) {
  const oneTimeOfferEnded = hasOneTimeOfferEnded(input);
  const normalizedStatus = resolveDashboardCourseStatus({
    status: oneTimeOfferEnded ? "ended" : input.status,
    isPublished: oneTimeOfferEnded ? false : input.isPublished,
    endsAt: input.lastSessionEndsAt ?? input.endsAt,
  });

  let view: Exclude<DashboardOfferView, "all"> = "active";
  if (normalizedStatus === "draft" || normalizedStatus === "paused" || normalizedStatus === "pause_scheduled") {
    view = "drafts";
  } else if (
    normalizedStatus === "stop_scheduled" ||
    normalizedStatus === "ended"
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
    view,
    currentStatusLabel: getCourseStatusLabel(normalizedStatus),
    playClassName,
    pauseClassName,
    stopClassName,
    playDisabled,
    pauseDisabled,
    stopDisabled,
  } satisfies OfferActionVisualState & { normalizedStatus: ReturnType<typeof resolveDashboardCourseStatus> };
}
