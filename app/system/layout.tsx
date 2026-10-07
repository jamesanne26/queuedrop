import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSystemOwner } from "@/lib/auth/system-owner";

export default async function SystemLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/auth/login?next=%2Fsystem");
  if (!(await isSystemOwner(data.user))) redirect("/dashboard");

  return (
    <main className="system-shell">
      <header className="system-topbar">
        <Link href="/system" className="brand-mark">QueueDrop System</Link>
        <nav>
          <Link href="/system">Clients</Link>
          <Link href="/system/plans">Plans</Link>
          <Link href="/system/sms">SMS Routing</Link>
          <Link href="/system/operations">Operations</Link>
          <a href="/api/support/start?from=%2Fsystem">Support reports</a>
          <Link href="/pricing">Public pricing</Link>
          <Link href="/">Website</Link>
        </nav>
      </header>
      {children}
    </main>
  );
}
