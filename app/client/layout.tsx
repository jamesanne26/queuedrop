import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function ClientLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/auth/login?next=%2Fclient");

  const { data: membership } = await supabase
    .from("business_users")
    .select("role")
    .eq("user_id", userData.user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    redirect("/dashboard");
  }

  return (
    <main className="client-shell">
      <header className="client-topbar">
        <Link href="/client" className="brand-mark">QueueDrop Settings</Link>
        <Link href="/dashboard" className="button button-secondary">Back to dashboard</Link>
      </header>
      {children}
    </main>
  );
}
