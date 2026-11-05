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

  // The dedicated E2E owner is used for branch lifecycle scenarios. Restore a
  // temporary branch-capacity override so the default one-branch Starter plan
  // does not block those scenarios. This is guarded to the dedicated TEST
  // Supabase project above and expires automatically.
  const { data: capacity, error: capacityError } = await admin.from("business_subscriptions")
    .select("custom_max_branches,override_expires_at").eq("id", subscription.id)
    .eq("business_id", owner.businessId).maybeSingle();
  if (capacityError) throw capacityError;
  const capacityExpiresAt = capacity?.override_expires_at ? Date.parse(capacity.override_expires_at) : Infinity;
  if ((capacity?.custom_max_branches ?? 0) < 20 || capacityExpiresAt < now + 60 * 60 * 1000) {
    const { data: capacityUpdated, error: capacityUpdateError } = await admin.from("business_subscriptions")
      .update({
        custom_max_branches: 20,
        override_reason: "Automated TEST E2E branch lifecycle capacity",
        override_expires_at: new Date(now + 24 * 60 * 60 * 1000).toISOString(),
      })
      .eq("id", subscription.id).eq("business_id", owner.businessId).select("id").maybeSingle();
    if (capacityUpdateError) throw capacityUpdateError;
    if (!capacityUpdated) throw new Error("TEST E2E branch capacity fixture update affected no row.");
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


// Temporarily grant service capacity only to the dedicated TEST owner while
// running UI scenarios that deliberately create multiple services per branch.
// Call the returned restore function from the scenario's finally block.
export async function grantTemporaryE2EServiceCapacity(admin, owner, testUrl, minimum = 6) {
  assertDedicatedTestProject(testUrl);
  if (owner?.role !== "owner" || !owner.businessId) {
    throw new Error("TEST service capacity requires an explicit business owner membership.");
  }
  const { data: subscription, error } = await admin.from("business_subscriptions")
    .select("id,custom_max_services_per_branch,custom_max_active_queues_per_branch,override_expires_at,override_reason")
    .eq("business_id", owner.businessId).maybeSingle();
  if (error) throw error;
  if (!subscription) throw new Error("Dedicated TEST owner needs a subscription fixture for multi-service scenarios.");
  const original = {
    custom_max_services_per_branch: subscription.custom_max_services_per_branch,
    custom_max_active_queues_per_branch: subscription.custom_max_active_queues_per_branch,
    override_expires_at: subscription.override_expires_at,
    override_reason: subscription.override_reason,
  };
  const { error: updateError } = await admin.from("business_subscriptions").update({
    custom_max_services_per_branch: Math.max(minimum, original.custom_max_services_per_branch ?? 0),
    custom_max_active_queues_per_branch: Math.max(minimum, original.custom_max_active_queues_per_branch ?? 0),
    override_expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    override_reason: "Temporary dedicated TEST E2E multi-service fixture",
  }).eq("id", subscription.id).eq("business_id", owner.businessId);
  if (updateError) throw updateError;
  return async () => {
    const { error: restoreError } = await admin.from("business_subscriptions")
      .update(original).eq("id", subscription.id).eq("business_id", owner.businessId);
    if (restoreError) throw restoreError;
  };
}
