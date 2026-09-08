import { test, expect } from "@playwright/test";
import { loginAsOwner } from "../helpers/auth.mjs";
import { hasAdminTestEnvironment, ownerCredentials } from "../helpers/env.mjs";
import {
  cleanupAuthUserByEmail,
  cleanupOwnedBranch,
  cleanupRoleByName,
  createAdminClient,
  findAuthUserByEmail,
  findBranchByName,
  findRoleByName,
  getBusinessMembership,
  getOwnerBusiness,
  getProfile,
} from "../helpers/admin-db.mjs";
import { createBranchFromUi, scenarioId } from "../helpers/scenario-fixtures.mjs";
import { dismissDashboardResultModal, expectNoAppError } from "../helpers/ui.mjs";

const credentials = ownerCredentials();
const adminReady = hasAdminTestEnvironment();

test.describe("owner team and role management", () => {
  test.skip(!credentials || !adminReady, "Owner credentials and TEST Supabase admin variables are required.");

  test("Scenario 13 - custom role create and update with permission persistence", async ({ page }) => {
    const id = scenarioId("role");
    const roleName = `E2E Role ${id}`;
    const updatedRoleName = `${roleName} Updated`;
    const admin = createAdminClient();
    const owner = await getOwnerBusiness(admin, credentials.email);
    await cleanupRoleByName(admin, owner.businessId, roleName);
    await cleanupRoleByName(admin, owner.businessId, updatedRoleName);

    try {
      await loginAsOwner(page, credentials);
      await page.goto("/dashboard/team?tab=roles", { waitUntil: "domcontentloaded" });
      await expectNoAppError(page);
      await page.getByRole("button", { name: "+ Create Custom Role", exact: true }).click();
      const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Create Role", exact: true }) }).first();
      await form.locator('input[name="name"]').fill(roleName);
      await form.locator('input[name="description"]').fill("E2E role for queue regression testing");
      await form.locator('select[name="branch_scope"]').selectOption("own_branch_only");
      const viewQueuePermission = form.locator('input[name="permissions"][value="view_live_queue"]');
      if (await viewQueuePermission.count()) await viewQueuePermission.check();
      const callNextPermission = form.locator('input[name="permissions"][value="call_next_customer"]');
      if (await callNextPermission.count()) await callNextPermission.check();
      await form.getByRole("button", { name: "Create Role", exact: true }).click();
      await page.waitForURL((url) => url.pathname === "/dashboard/team" && url.searchParams.get("tab") === "roles" && url.searchParams.get("message") === "Custom role created successfully.", { timeout: 20_000 });
      await dismissDashboardResultModal(page, "Custom role created successfully.");

      let role = await findRoleByName(admin, owner.businessId, roleName);
      expect(role).not.toBeNull();
      expect(role?.branch_scope).toBe("own_branch_only");
      expect(role?.base_role).toBe("staff");

      // After creation QueueDrop already selects the new role and opens its
      // detail editor. Avoid depending on the sidebar button's composite
      // accessible name (it also contains the role initial and “Custom role”).
      const editForm = page.locator("form").filter({ has: page.getByRole("button", { name: "Save Role & Permissions", exact: true }) }).first();
      await expect(editForm).toBeVisible();
      await editForm.locator('input[name="name"]').fill(updatedRoleName);
      await editForm.locator('input[name="description"]').fill("Updated E2E role description");
      await editForm.locator('select[name="branch_scope"]').selectOption("selected_branches");
      await editForm.getByRole("button", { name: "Save Role & Permissions", exact: true }).click();
      await page.waitForURL((url) => url.pathname === "/dashboard/team" && url.searchParams.get("tab") === "roles" && url.searchParams.get("message") === "Role permissions updated successfully.", { timeout: 20_000 });
      await dismissDashboardResultModal(page, "Role permissions updated successfully.");

      role = await findRoleByName(admin, owner.businessId, updatedRoleName);
      expect(role).not.toBeNull();
      expect(role?.branch_scope).toBe("selected_branches");
      expect(role?.base_role).toBe("manager");
    } finally {
      await cleanupRoleByName(admin, owner.businessId, roleName);
      await cleanupRoleByName(admin, owner.businessId, updatedRoleName);
    }
  });

  test("Scenario 14 - team member create, update, deactivate/reactivate, and delete", async ({ page }) => {
    const id = scenarioId("team");
    const branchName = `E2E Team Branch ${id}`;
    const roleName = `E2E Staff Role ${id}`;
    const fullName = `E2E Team Member ${id}`;
    const updatedName = `${fullName} Updated`;
    const email = `queuedrop.e2e.${id.replace(/[^a-z0-9]/gi, "").toLowerCase()}@example.com`;
    const phone = `0917${String(Date.now()).slice(-7)}`.slice(0, 11);
    const admin = createAdminClient();
    const owner = await getOwnerBusiness(admin, credentials.email);
    await cleanupAuthUserByEmail(admin, email);
    await cleanupOwnedBranch(admin, owner.businessId, branchName);
    await cleanupRoleByName(admin, owner.businessId, roleName);

    try {
      await loginAsOwner(page, credentials);
      await createBranchFromUi(page, branchName);
      const branch = await findBranchByName(admin, owner.businessId, branchName);
      expect(branch).not.toBeNull();

      // Create an own-branch staff role used only by this scenario.
      await page.goto("/dashboard/team?tab=roles", { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: "+ Create Custom Role", exact: true }).click();
      const roleForm = page.locator("form").filter({ has: page.getByRole("button", { name: "Create Role", exact: true }) }).first();
      await roleForm.locator('input[name="name"]').fill(roleName);
      await roleForm.locator('input[name="description"]').fill("E2E staff lifecycle role");
      await roleForm.locator('select[name="branch_scope"]').selectOption("own_branch_only");
      await roleForm.getByRole("button", { name: "Create Role", exact: true }).click();
      await page.waitForURL((url) => url.searchParams.get("message") === "Custom role created successfully.", { timeout: 20_000 });
      await dismissDashboardResultModal(page, "Custom role created successfully.");
      const role = await findRoleByName(admin, owner.businessId, roleName);
      expect(role).not.toBeNull();

      await page.goto(`/dashboard/team?branch=${branch.id}`, { waitUntil: "domcontentloaded" });
      const createForm = page.locator('form.management-form').filter({ has: page.locator('input[name="full_name"]') }).first();
      await createForm.locator('input[name="full_name"]').fill(fullName);
      await createForm.locator('input[name="email"]').fill(email);
      await createForm.locator('input[name="phone"]').fill(phone);
      await createForm.getByLabel("Assigned Role").selectOption({ label: roleName });
      await createForm.locator('select[name="branch_ids"]').selectOption(branch.id);
      await createForm.locator('input[name="temporary_password"]').fill("E2Epass123!");
      await createForm.getByRole("button", { name: "Create team member", exact: true }).click();
      await page.waitForURL((url) => url.pathname === "/dashboard/team" && url.searchParams.get("message")?.startsWith("Team member created successfully."), { timeout: 25_000 });
      await dismissDashboardResultModal(page, "Team member created successfully.");

      let authUser = await findAuthUserByEmail(admin, email);
      expect(authUser).not.toBeNull();
      let profile = await getProfile(admin, authUser.id);
      expect(profile?.full_name).toBe(fullName);
      expect(profile?.phone).toBe(phone);
      let membership = await getBusinessMembership(admin, owner.businessId, authUser.id);
      expect(membership?.role_id).toBe(role.id);
      expect(membership?.is_active).toBe(true);

      let memberCard = page.locator("article.team-card", { hasText: fullName });
      await memberCard.getByRole("button", { name: "Edit details", exact: true }).click();
      let editDialog = page.getByRole("dialog", { name: "Edit details" });
      await editDialog.locator('input[name="full_name"]').fill(updatedName);
      await editDialog.locator('select').filter({ has: page.locator('option[value="true"]') }).selectOption("false");
      await editDialog.getByRole("button", { name: "Save changes", exact: true }).click();
      const confirmUpdate = page.getByRole("dialog").filter({ hasText: "Are you sure you want to update?" });
      await confirmUpdate.getByRole("button", { name: "Yes, update", exact: true }).click();
      await page.waitForURL((url) => url.searchParams.get("message") === "Team member details updated successfully.", { timeout: 25_000 });
      await dismissDashboardResultModal(page, "Team member details updated successfully.");

      authUser = await findAuthUserByEmail(admin, email);
      profile = await getProfile(admin, authUser.id);
      expect(profile?.full_name).toBe(updatedName);
      membership = await getBusinessMembership(admin, owner.businessId, authUser.id);
      expect(membership?.is_active).toBe(false);

      // Reactivate using the same edit flow so both access states are covered.
      memberCard = page.locator("article.team-card", { hasText: updatedName });
      await memberCard.getByRole("button", { name: "Edit details", exact: true }).click();
      editDialog = page.getByRole("dialog", { name: "Edit details" });
      await editDialog.locator('select').filter({ has: page.locator('option[value="true"]') }).selectOption("true");
      await editDialog.getByRole("button", { name: "Save changes", exact: true }).click();
      await page.getByRole("dialog").filter({ hasText: "Are you sure you want to update?" }).getByRole("button", { name: "Yes, update", exact: true }).click();
      await page.waitForURL((url) => url.searchParams.get("message") === "Team member details updated successfully.", { timeout: 25_000 });
      await dismissDashboardResultModal(page, "Team member details updated successfully.");
      membership = await getBusinessMembership(admin, owner.businessId, authUser.id);
      expect(membership?.is_active).toBe(true);

      memberCard = page.locator("article.team-card", { hasText: updatedName });
      await memberCard.getByRole("button", { name: "Edit details", exact: true }).click();
      editDialog = page.getByRole("dialog", { name: "Edit details" });
      await editDialog.getByRole("button", { name: "Delete team member", exact: true }).click();
      const nameDialog = page.getByRole("dialog").filter({ hasText: "Please type" });
      await nameDialog.locator("input.qd-delete-name-input").fill(updatedName);
      await nameDialog.getByRole("button", { name: "Delete", exact: true }).click();
      const finalDelete = page.getByRole("dialog").filter({ hasText: "Are you sure you want to delete?" });
      await finalDelete.getByRole("button", { name: "Yes, delete", exact: true }).click();
      await page.waitForURL((url) => url.searchParams.get("message") === "Team member deleted.", { timeout: 25_000 });
      await dismissDashboardResultModal(page, "Team member deleted.");
      expect(await findAuthUserByEmail(admin, email)).toBeNull();
    } finally {
      await cleanupAuthUserByEmail(admin, email);
      await cleanupOwnedBranch(admin, owner.businessId, branchName);
      await cleanupRoleByName(admin, owner.businessId, roleName);
    }
  });
});
