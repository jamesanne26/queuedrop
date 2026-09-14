import Link from "next/link";
import { redirect } from "next/navigation";
import { createBusinessWorkspace } from "./actions";
import { createClient } from "@/lib/supabase/server";
import { DigitsOnlyInput } from "@/app/_components/digits-only-input";
import { OnboardingSubmitButton } from "./onboarding-submit-button";

type Props = {
  searchParams: Promise<{ error?: string }>;
};

export default async function OnboardingPage({ searchParams }: Props) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;

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
          {process.env.VERCEL_ENV === "production" ? null : <span className="env-badge">TEST</span>}
        </div>

        <div className="onboarding-heading">
          <p className="eyebrow">Business onboarding</p>
          <h1>Create your first workspace</h1>
          <p>
            {profile?.full_name ? `${profile.full_name}, ` : ""}
            set up your business and first branch. After this saves, QueueDrop will guide you to create your first service.
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
            <DigitsOnlyInput
              name="branch_phone"
              maxLength={20}
              placeholder="09171234567"
              autoComplete="tel"
            />
          </label>

          <div className="form-section-title form-section-spaced">
            <span>3</span>
            <div>
              <strong>Starter trial</strong>
              <small>Your Starter trial is activated automatically. Then you’ll add your first service.</small>
            </div>
          </div>

          <div className="onboarding-note">
            <strong>Created safely in one transaction:</strong>
            <span>business • owner access • Starter trial • first branch • branch access • queue defaults</span>
          </div>

          <OnboardingSubmitButton />
        </form>

        <p className="auth-footer"><Link href="/">Back to QueueDrop home</Link></p>
      </section>
    </main>
  );
}
