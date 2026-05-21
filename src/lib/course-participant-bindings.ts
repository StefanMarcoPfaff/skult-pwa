type CourseParticipantIntentLike = {
  status: string | null;
  stripe_subscription_id: string | null;
  is_simulation?: boolean | null;
  subscription_contract_id?: string | null;
  subscription_status?: string | null;
};

function normalizeBindingId(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized || null;
}

export function getCourseParticipantTicketBindingId(
  intent: CourseParticipantIntentLike,
  subscriptionContractStatus: string | null
): string | null {
  const externalSubscriptionId = normalizeBindingId(intent.stripe_subscription_id);
  if (intent.status === "checkout_completed" && externalSubscriptionId) {
    return externalSubscriptionId;
  }

  const internalContractId = normalizeBindingId(intent.subscription_contract_id);
  if (
    intent.is_simulation === true &&
    internalContractId &&
    intent.subscription_status === "active" &&
    subscriptionContractStatus === "active"
  ) {
    return internalContractId;
  }

  return null;
}

export function hasActiveRegisteredCourseParticipation(
  intent: CourseParticipantIntentLike,
  subscriptionContractStatus: string | null
): boolean {
  return Boolean(getCourseParticipantTicketBindingId(intent, subscriptionContractStatus));
}
