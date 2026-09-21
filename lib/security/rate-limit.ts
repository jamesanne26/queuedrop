import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimitKey, requestClientIp } from "./rate-limit-core";

export { rateLimitKey, requestClientIp } from "./rate-limit-core";

export type RateLimitPolicy = {
  name: string;
  limit: number;
  windowSeconds: number;
};

export async function consumeRateLimit(policy: RateLimitPolicy, subject: string) {
  const admin = createAdminClient();
  const key = rateLimitKey(policy.name, subject);
  const { data, error } = await admin.rpc("consume_app_rate_limit", {
    target_key: key,
    target_limit: policy.limit,
    target_window_seconds: policy.windowSeconds,
  });
  if (error) {
    console.error(JSON.stringify({ event: "rate_limit_error", policy: policy.name, message: error.message }));
    return { allowed: false, retryAfter: Math.max(1, policy.windowSeconds) };
  }
  const result = (data ?? {}) as { allowed?: boolean; retry_after_seconds?: number };
  return {
    allowed: result.allowed === true,
    retryAfter: Math.max(1, Number(result.retry_after_seconds ?? policy.windowSeconds)),
  };
}

export async function enforceDeviceRateLimits(headers: Pick<Headers, "get">, deviceToken: string, action: string, actorLimit: number, deviceLimit: number) {
  const ip = requestClientIp(headers);
  const actor = await consumeRateLimit({ name: `${action}:actor`, limit: actorLimit, windowSeconds: 60 }, `${deviceToken}:${ip}`);
  if (!actor.allowed) return actor;
  return consumeRateLimit({ name: `${action}:device`, limit: deviceLimit, windowSeconds: 60 }, deviceToken);
}
