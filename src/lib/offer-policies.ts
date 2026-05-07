type MaybeRecord = Record<string, unknown> | null | undefined;

export const WORKSHOP_POLICY_FALLBACK =
  "Es gelten die individuell festgelegten Bedingungen der Anbietenden";

export const COURSE_POLICY_FALLBACK =
  "Monatlich zum Ende des Abrechnungszeitraums möglich.";

export const COURSE_BILLING_SUMMARY = "monatlich ab Buchungsdatum";
export const COURSE_CANCELLATION_SUMMARY =
  "monatlich zum Ende des Abrechnungszeitraums möglich.";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function getWorkshopCancellationPolicyValue(input: MaybeRecord): string | null {
  return asString(input?.cancellation_policy) ?? asString(input?.workshop_storno_policy);
}

export function getCourseTerminationModelValue(input: MaybeRecord): string | null {
  return asString(input?.termination_model) ?? asString(input?.cancellation_model);
}

export function getWorkshopCancellationPolicyLabel(value: string | null | undefined): string {
  switch (value) {
    case "14_days_free":
    case "free_until_14_days_then_100":
      return "Bis 14 Tage vor Beginn kostenfrei, danach 100 %";
    case "7_days_free":
    case "free_until_7_days_then_100":
      return "Bis 7 Tage vor Beginn kostenfrei, danach 100 %";
    case "14_days_50":
    case "fifty_until_14_days_then_100":
      return "Bis 14 Tage vor Beginn 50 %, danach 100 %";
    case "no_refund":
    default:
      return "Keine Stornierung / keine Erstattung";
  }
}

export function getCourseTerminationModelLabel(value: string | null | undefined): string {
  void value;
  return "Monatlich zum Ende des Abrechnungszeitraums möglich.";
}

export function getWorkshopCancellationPolicySummary(input: MaybeRecord): string {
  const value = getWorkshopCancellationPolicyValue(input);
  return value ? getWorkshopCancellationPolicyLabel(value) : WORKSHOP_POLICY_FALLBACK;
}

export function getCourseTerminationModelSummary(input: MaybeRecord): string {
  const value = getCourseTerminationModelValue(input);
  return value ? getCourseTerminationModelLabel(value) : COURSE_POLICY_FALLBACK;
}
