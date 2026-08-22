import Link from "next/link";
import { redirect } from "next/navigation";
import { createBusinessWorkspace } from "./actions";
import { createClient } from "@/lib/supabase/server";

type Props = {
  searchParams: Promise<{ error?: string }>;
};

export default async function OnboardingPage({ searchParams }: Props) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;

  if (!userId) {
    redirect("/auth/login?next=%2Fonboarding");
  }

  const [{ data: profile }, { data: membership }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
    supabase
      .from("business_users")
      .select("business_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle(),
  ]);

  if (membership) {
    redirect("/dashboard");
  }

  return (
    <main className="onboarding-shell">
      <section className="onboarding-card">
        <div className="onboarding-topline">
          <Link href="/" className="brand-mark">QueueDrop</Link>
          <span className="env-badge">DEV</span>
        </div>

        <div className="onboarding-heading">
          <p className="eyebrow">Business onboarding</p>
          <h1>Create your first workspace</h1>
          <p>
            {profile?.full_name ? `${profile.full_name}, ` : ""}
            set up the business and first branch that your team will use for QueueDrop.
          </p>
        </div>

        {error ? <div className="notice notice-error">{error}</div> : null}

        <form action={createBusinessWorkspace} className="form-stack onboarding-form">
          <div className="form-section-title">
            <span>1</span>
            <div>
              <strong>Business</strong>
              <small>Your company, clinic, salon, shop, or organization.</small>
            </div>
          </div>

          <label>
            Business name
            <input
              name="business_name"
              type="text"
              minLength={2}
              maxLength={120}
              required
              placeholder="Cuba O Salon"
              autoFocus
            />
          </label>

          <div className="form-section-title form-section-spaced">
            <span>2</span>
            <div>
              <strong>First branch</strong>
              <small>You can add more branches after onboarding.</small>
            </div>
          </div>

          <label>
            Branch name
            <input
              name="branch_name"
              type="text"
              minLength={2}
              maxLength={120}
              required
              placeholder="Cubao Branch"
            />
          </label>

          <label>
            Branch address <em>Optional</em>
            <input
              name="branch_address"
              type="text"
              maxLength={300}
              placeholder="Quezon City, Metro Manila"
            />
          </label>

          <label>
            Branch contact number <em>Optional</em>
            <input
              name="branch_phone"
              type="tel"
              maxLength={32}
              placeholder="+63 917 123 4567"
            />
          </label>

          <div className="onboarding-note">
            <strong>Created together in one transaction:</strong>
            <span>business • owner access • first branch • branch access • default queue settings</span>
          </div>

          <button className="button button-primary button-large" type="submit">
            Create QueueDrop workspace
          </button>
        </form>

        <p className="auth-footer"><Link href="/dashboard">Back to dashboard</Link></p>
      </section>
    </main>
  );
}
