export type SmsRouteMethod = {
  id: string;
  name: string;
  method_type: string;
  country_code: string;
  is_enabled: boolean;
  priority: number;
  cost_per_sms?: number | null;
};

export type SmsRouteRuleLike = {
  primary_method_id: string | null;
  fallback_method_ids: string[] | null;
  routing_policy: string;
};

export function validateRouteMethodSelection({
  countryCode,
  primaryMethodId,
  fallbackMethodIds,
  methods,
}: {
  countryCode: string;
  primaryMethodId: string;
  fallbackMethodIds: string[];
  methods: SmsRouteMethod[];
}) {
  const available = methods.filter((method) => method.is_enabled && method.country_code === countryCode);
  const byId = new Map(available.map((method) => [method.id, method]));
  const primary = byId.get(primaryMethodId);
  if (!primary) throw new Error("Select an enabled delivery method for this country before saving the route.");

  const fallback = fallbackMethodIds.filter((id) => id !== primaryMethodId);
  for (const id of fallback) {
    if (!byId.has(id)) throw new Error("One or more fallback delivery methods are unavailable for this country.");
  }

  return { primary, fallbackMethodIds: [...new Set(fallback)] };
}

export function orderSmsMethodsForRule(rule: SmsRouteRuleLike, available: SmsRouteMethod[]) {
  const ids = [rule.primary_method_id, ...(rule.fallback_method_ids ?? [])]
    .filter((value): value is string => Boolean(value));
  let ordered = ids
    .map((id) => available.find((method) => method.id === id))
    .filter((method): method is SmsRouteMethod => Boolean(method));

  if (rule.routing_policy === "cloud_only") {
    ordered = available.filter((method) => method.method_type === "cloud_provider");
  } else if (rule.routing_policy === "android_only") {
    ordered = available.filter((method) => method.method_type !== "cloud_provider");
  } else if (rule.routing_policy === "cheapest") {
    ordered = [...available].sort(
      (a, b) => (a.cost_per_sms ?? Number.MAX_SAFE_INTEGER) - (b.cost_per_sms ?? Number.MAX_SAFE_INTEGER),
    );
  } else if (rule.routing_policy === "most_reliable") {
    // Reliability scoring is not persisted yet, so preserve deterministic configured/priority order.
    ordered = ordered.length ? ordered : [...available];
  } else if (ordered.length === 0) {
    // A configured manual/branch-first rule must never silently fall through to an arbitrary
    // enabled provider. That can route paid SMS to the wrong gateway/provider.
    return [];
  }

  return ordered;
}
