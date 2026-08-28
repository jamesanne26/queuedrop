import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function ClientPage() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const { data: membership } = await supabase
    .from("business_users")
    .select("businesses(name)")
    .eq("user_id", userData.user!.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  const business = Array.isArray(membership?.businesses)
    ? membership.businesses[0]
    : membership?.businesses;

  return (
    <section className="client-content">
      <div className="client-hero">
        <p className="eyebrow">Client administration</p>
        <h1>{business?.name ?? "QueueDrop"}</h1>
        <p className="muted page-lead">Manage client-level access separately from daily branch operations.</p>
      </div>

      <div className="client-card-grid">
        <Link href="/client/subscription" className="client-feature-card">
          <span className="client-feature-icon" aria-hidden="true">$</span>
          <div><h2>Subscription & billing</h2><p>Choose a QueueDrop plan, pay online, and review checkout activity.</p></div>
        </Link>

        <Link href="/client/configurations" className="client-feature-card">
          <span className="client-feature-icon" aria-hidden="true">⚙</span>
          <div>
            <h2>Configurations</h2>
            <p>Choose which team members may access selected branch settings and branch status controls.</p>
          </div>
        </Link>
      </div>
    </section>
  );
}
