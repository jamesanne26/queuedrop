import { createHash } from "node:crypto";

export function requestClientIp(headers: Pick<Headers, "get">) {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "unknown";
}

export function rateLimitKey(policyName: string, subject: string) {
  return createHash("sha256").update(`${policyName}:${subject}`).digest("hex");
}
