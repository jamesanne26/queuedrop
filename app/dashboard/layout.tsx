import type { ReactNode } from "react";
import { DashboardFrame } from "@/app/dashboard/_components/dashboard-frame";
import { createClient } from "@/lib/supabase/server";

type Role = "owner" | "admin" | "manager" | "staff";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();

  let role: Role | null = null;

  if (userData.user) {
    const { data: currentRole, error: roleError } = await supabase.rpc(
      "get_current_business_role",
    );

    if (!roleError && currentRole) {
      role = currentRole as Role;
    } else {
      const { data: membership } = await supabase
        .from("business_users")
        .select("role")
        .eq("user_id", userData.user.id)
        .limit(1)
        .maybeSingle();

      role = (membership?.role as Role | undefined) ?? null;
    }
  }

  return <DashboardFrame role={role}>{children}</DashboardFrame>;
}
