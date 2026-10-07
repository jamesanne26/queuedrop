const TEST_ORIGIN = "https://tcgiwtfhqssulxwawimh.supabase.co";

export function assertDedicatedTestProject(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error("E2E subscription setup requires the dedicated TEST Supabase project."); }
  if (url.origin !== TEST_ORIGIN || url.pathname !== "/" || url.search || url.hash || url.username || url.password) {
    throw new Error("E2E subscription setup refuses non-TEST Supabase projects.");
  }
}

export async function ensureE2ESubscriptionAccess(admin, owner, testUrl, now = Date.now()) {
  assertDedicatedTestProject(testUrl);
  if (owner?.role !== "owner" || !owner.businessId) throw new Error("E2E subscription setup requires the configured business owner.");

  const { data: subscription, error } = await admin.from("business_subscriptions")
    .select("id,status,expires_at").eq("business_id", owner.businessId).maybeSingle();
  if (error) throw error;
  if (!subscription) return; // Legacy TEST workspaces without subscriptions remain valid.
  if (!["active", "trialing", "expired"].includes(subscription.status)) {
    throw new Error("E2E subscription has an unexpected billing state; fixture setup will not override it.");
  }

  const expiry = subscription.expires_at ? Date.parse(subscription.expires_at) : Infinity;
  if (subscription.status === "expired" || expiry < now + 60 * 60 * 1000) {
    const { data: updated, error: updateError } = await admin.from("business_subscriptions")
      .update({
        status: subscription.status === "trialing" ? "trialing" : "active",
        expires_at: new Date(now + 24 * 60 * 60 * 1000).toISOString(),
      })
      .eq("id", subscription.id).eq("business_id", owner.businessId).select("id").maybeSingle();
    if (updateError) throw updateError;
    if (!updated) throw new Error("E2E subscription fixture update affected no row.");
  }

  const { data: state, error: stateError } = await admin.rpc("get_subscription_access_state", { target_business_id: owner.businessId });
  if (stateError) throw stateError;
  if (!["active", "trialing"].includes(state)) throw new Error("E2E subscription fixture is still not writable.");
}
