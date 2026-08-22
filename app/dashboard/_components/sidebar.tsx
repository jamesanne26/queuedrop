import Link from "next/link";
import { signOut } from "@/app/auth/actions";

type Props = {
  active: "overview" | "branches" | "services" | "queues";
};

export function DashboardSidebar({ active }: Props) {
  return (
    <aside className="sidebar">
      <Link href="/" className="brand-mark brand-light">QueueDrop</Link>
      <nav>
        <Link className={`nav-item ${active === "overview" ? "nav-item-active" : ""}`} href="/dashboard">Overview</Link>
        <Link className={`nav-item ${active === "branches" ? "nav-item-active" : ""}`} href="/dashboard/branches">Branches</Link>
        <Link className={`nav-item ${active === "services" ? "nav-item-active" : ""}`} href="/dashboard/services">Services</Link>
        <Link className={`nav-item ${active === "queues" ? "nav-item-active" : ""}`} href="/dashboard/queues">Queues</Link>
        <span className="nav-item nav-item-muted">Team <small>later</small></span>
      </nav>
      <form action={signOut} className="sidebar-footer">
        <button className="button button-ghost-light" type="submit">Sign out</button>
      </form>
    </aside>
  );
}
