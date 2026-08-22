import Link from "next/link";
import { signOut } from "@/app/auth/actions";
import { createClient } from "@/lib/supabase/server";

type Props = {
  active:
    | "overview"
    | "branches"
    | "services"
    | "queues"
    | "team"
    | "settings";
};

export async function DashboardSidebar({ active }: Props) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  const { data: membership } = user
    ? await supabase
        .from("business_users")
        .select("role, is_active")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle()
    : { data: null };

  const canManageTeam =
    membership?.role === "owner" ||
    membership?.role === "admin" ||
    membership?.role === "manager";

  const canViewSettings =
    membership?.role === "owner" ||
    membership?.role === "admin" ||
    membership?.role === "manager";

  return (
    <aside className="sidebar">
      <Link href="/" className="brand-mark brand-light">
        QueueDrop
      </Link>

      <nav>
        <Link
          className={`nav-item ${
            active === "overview" ? "nav-item-active" : ""
          }`}
          href="/dashboard"
        >
          Overview
        </Link>

        <Link
          className={`nav-item ${
            active === "branches" ? "nav-item-active" : ""
          }`}
          href="/dashboard/branches"
        >
          Branches
        </Link>

        <Link
          className={`nav-item ${
            active === "services" ? "nav-item-active" : ""
          }`}
          href="/dashboard/services"
        >
          Services
        </Link>

        <Link
          className={`nav-item ${
            active === "queues" ? "nav-item-active" : ""
          }`}
          href="/dashboard/queues"
        >
          Queues
        </Link>

        {canManageTeam ? (
          <Link
            className={`nav-item ${
              active === "team" ? "nav-item-active" : ""
            }`}
            href="/dashboard/team"
          >
            Team
          </Link>
        ) : null}

        {canViewSettings ? (
          <Link
            className={`nav-item ${
              active === "settings" ? "nav-item-active" : ""
            }`}
            href="/dashboard/settings"
          >
            Settings
          </Link>
        ) : null}
      </nav>

      <form action={signOut} className="sidebar-footer">
        <button
          className="button button-ghost-light"
          type="submit"
        >
          Sign out
        </button>
      </form>
    </aside>
  );
}
