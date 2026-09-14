import { createClient } from "@supabase/supabase-js";
import { requiredEnv } from "./env.mjs";

export function createAdminClient() {
  return createClient(
    requiredEnv("QUEUEDROP_TEST_SUPABASE_URL"),
    requiredEnv("QUEUEDROP_TEST_SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export async function getOwnerBusiness(admin, ownerEmail) {
  let page = 1;
  let user = null;

  while (!user && page <= 10) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    user = data.users.find((candidate) => candidate.email?.toLowerCase() === ownerEmail.toLowerCase()) ?? null;
    if (user || data.users.length < 100) break;
    page += 1;
  }

  if (!user) throw new Error(`E2E owner was not found in TEST Supabase: ${ownerEmail}`);

  const { data: memberships, error } = await admin
    .from("business_users")
    .select("business_id, role")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(10);
  if (error) throw error;

  const membership = memberships?.find((item) => item.role === "owner") ?? memberships?.[0] ?? null;
  if (!membership?.business_id) throw new Error("E2E owner has no active TEST business membership.");

  return { userId: user.id, businessId: membership.business_id, role: membership.role };
}

export async function findBranchByName(admin, businessId, name) {
  const { data, error } = await admin
    .from("branches")
    .select("id, name, business_id")
    .eq("business_id", businessId)
    .eq("name", name)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function findServiceByName(admin, branchId, name) {
  const { data, error } = await admin
    .from("services")
    .select("id, name, branch_id")
    .eq("branch_id", branchId)
    .eq("name", name)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}


export async function cleanupOrphanedE2EBusinessServices(admin, businessId) {
  const { data: services, error: serviceError } = await admin
    .from("business_services")
    .select("id,name")
    .eq("business_id", businessId)
    .ilike("name", "E2E %");
  if (serviceError) throw serviceError;

  const ids = (services ?? []).map((service) => service.id);
  if (!ids.length) return;

  const { data: assignedRows, error: assignmentError } = await admin
    .from("branch_service_catalog")
    .select("business_service_id")
    .in("business_service_id", ids);
  if (assignmentError) throw assignmentError;

  const assigned = new Set((assignedRows ?? []).map((row) => row.business_service_id));
  const orphanIds = ids.filter((id) => !assigned.has(id));
  if (!orphanIds.length) return;

  const { error: deleteError } = await admin
    .from("business_services")
    .delete()
    .eq("business_id", businessId)
    .in("id", orphanIds);
  if (deleteError) throw deleteError;
}

export async function cleanupOwnedBranch(admin, businessId, branchName) {
  // Capture catalog rows before deleting the branch. Since services are now
  // business-wide, deleting a branch removes branch_service_catalog mappings but
  // intentionally leaves business_services behind. Without explicit fixture
  // cleanup, repeated E2E runs make the Settings service library grow forever
  // and progressively slow down otherwise-correct scenarios.
  const { data: branches, error: branchLookupError } = await admin
    .from("branches")
    .select("id")
    .eq("business_id", businessId)
    .eq("name", branchName);
  if (branchLookupError) throw branchLookupError;

  const branchIds = (branches ?? []).map((branch) => branch.id);
  let businessServiceIds = [];
  if (branchIds.length) {
    const { data: catalogRows, error: catalogError } = await admin
      .from("branch_service_catalog")
      .select("business_service_id")
      .in("branch_id", branchIds);
    if (catalogError) throw catalogError;
    businessServiceIds = [...new Set((catalogRows ?? []).map((row) => row.business_service_id).filter(Boolean))];
  }

  // Delete every matching scenario fixture, not just one row. This also repairs
  // stale duplicate fixtures left behind by an interrupted/failed test run.
  const { error } = await admin
    .from("branches")
    .delete()
    .eq("business_id", businessId)
    .eq("name", branchName);
  if (error) throw error;

  const { count, error: countError } = await admin
    .from("branches")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .eq("name", branchName);
  if (countError) throw countError;
  if ((count ?? 0) !== 0) throw new Error(`E2E cleanup failed for branch: ${branchName}`);

  // Only remove orphaned E2E catalog services. Never delete a catalog service
  // that is still assigned to another branch or is not clearly test-owned.
  for (const businessServiceId of businessServiceIds) {
    const { count: assignmentCount, error: assignmentError } = await admin
      .from("branch_service_catalog")
      .select("branch_id", { count: "exact", head: true })
      .eq("business_service_id", businessServiceId);
    if (assignmentError) throw assignmentError;
    if ((assignmentCount ?? 0) !== 0) continue;

    const { data: catalogService, error: serviceLookupError } = await admin
      .from("business_services")
      .select("id,name,business_id")
      .eq("id", businessServiceId)
      .eq("business_id", businessId)
      .maybeSingle();
    if (serviceLookupError) throw serviceLookupError;
    if (!catalogService?.name?.startsWith("E2E ")) continue;

    const { error: catalogDeleteError } = await admin
      .from("business_services")
      .delete()
      .eq("id", businessServiceId)
      .eq("business_id", businessId);
    if (catalogDeleteError) throw catalogDeleteError;
  }

  // Also repair orphaned E2E catalog rows left by older interrupted runs. This
  // is intentionally limited to the TEST-owned `E2E ` prefix and never touches
  // services that are still assigned to any branch.
  await cleanupOrphanedE2EBusinessServices(admin, businessId);
}

export async function getBranchById(admin, branchId) {
  const { data, error } = await admin.from("branches").select("id,name,business_id,status,address,phone,timezone").eq("id", branchId).maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function getServiceById(admin, serviceId) {
  const { data, error } = await admin.from("services").select("id,name,branch_id,description,queue_prefix,estimated_minutes,is_active").eq("id", serviceId).maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function findTerminalByName(admin, branchId, name) {
  const { data, error } = await admin.from("devices")
    .select("id,name,device_token,branch_id,service_id,is_active,device_type")
    .eq("branch_id", branchId).eq("name", name).eq("device_type", "ticket_terminal").maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function latestTicketForService(admin, branchId, serviceId) {
  const { data, error } = await admin.from("tickets")
    .select("id,display_number,status,branch_id,service_id,ticket_number,sms_phone,joined_at,called_at,serving_at,completed_at,cancelled_at")
    .eq("branch_id", branchId).eq("service_id", serviceId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function getTicketById(admin, ticketId) {
  const { data, error } = await admin.from("tickets")
    .select("id,display_number,status,branch_id,service_id,ticket_number,sms_phone,joined_at,called_at,serving_at,completed_at,cancelled_at")
    .eq("id", ticketId).maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function getCustomerSessionForTicket(admin, ticketId) {
  const { data: ticket, error: ticketError } = await admin
    .from("tickets")
    .select("customer_session_id")
    .eq("id", ticketId)
    .maybeSingle();
  if (ticketError) throw ticketError;
  if (!ticket?.customer_session_id) return null;

  const { data, error } = await admin
    .from("customer_sessions")
    .select("id,session_token")
    .eq("id", ticket.customer_session_id)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function getQueueConfiguration(admin, branchId) {
  const { data, error } = await admin.from("queue_configurations")
    .select("branch_id,customer_refresh_seconds,sms_notifications_enabled,sms_start_position")
    .eq("branch_id", branchId).maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function findRoleByName(admin, businessId, name) {
  const { data, error } = await admin.from("roles")
    .select("id,business_id,name,description,base_role,branch_scope,is_system,is_protected")
    .eq("business_id", businessId).eq("name", name).maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function cleanupRoleByName(admin, businessId, name) {
  const role = await findRoleByName(admin, businessId, name);
  if (!role) return;
  const { error } = await admin.from("roles").delete().eq("id", role.id).eq("business_id", businessId);
  if (error) throw error;
}

export async function findAuthUserByEmail(admin, email) {
  let page = 1;
  while (page <= 10) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    const user = data.users.find((item) => item.email?.toLowerCase() === email.toLowerCase());
    if (user) return user;
    if (data.users.length < 100) return null;
    page += 1;
  }
  return null;
}

export async function cleanupAuthUserByEmail(admin, email) {
  const user = await findAuthUserByEmail(admin, email);
  if (!user) return;
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) throw error;
}

export async function getProfile(admin, userId) {
  const { data, error } = await admin.from("profiles").select("id,full_name,email,phone").eq("id", userId).maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function getBusinessMembership(admin, businessId, userId) {
  const { data, error } = await admin.from("business_users")
    .select("id,business_id,user_id,role,role_id,custom_role_name,is_active")
    .eq("business_id", businessId).eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data ?? null;
}
