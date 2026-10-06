export function smsTicketEligible(status: string | null) {
  return status === "waiting" || status === "called";
}

export function ambiguousDeliveryError(error: unknown) {
  return error instanceof Error && ["TimeoutError", "AbortError", "TypeError", "DeliveryUncertainError"].includes(error.name);
}
