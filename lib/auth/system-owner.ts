import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function isSystemOwner(user: User | null | undefined) {
  if (!user) return false;
  const allowlist = (process.env.SYSTEM_OWNER_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (user.email && allowlist.includes(user.email.toLowerCase())) return true;

  const supabase = await createClient();
  const { data } = await supabase
    .from("system_owners")
    .select("user_id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();
  return Boolean(data);
}

export async function requireSystemOwner() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/auth/login?next=%2Fsystem");
  if (!(await isSystemOwner(data.user))) redirect("/dashboard");
  return data.user;
}
