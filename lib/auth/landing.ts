import type { SupabaseClient, User } from "@supabase/supabase-js";

function safeInternalPath(value: string | null | undefined) {
  return Boolean(value && value.startsWith("/") && !value.startsWith("//"));
}

export async function resolveAuthenticatedLanding(
  supabase: SupabaseClient,
  user: User,
  requestedNext?: string | null,
) {
  const allowlist = (process.env.SYSTEM_OWNER_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const envOwner = Boolean(user.email && allowlist.includes(user.email.toLowerCase()));
  const { data: systemOwner } = await supabase
    .from("system_owners")
    .select("user_id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (envOwner || systemOwner) return "/system";

  if (safeInternalPath(requestedNext) && requestedNext !== "/dashboard") {
    return requestedNext!;
  }

  const { data: membership } = await supabase
    .from("business_users")
    .select("role")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (membership?.role === "staff") return "/dashboard/queues";
  return "/dashboard";
}
