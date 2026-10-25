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

  test("Users and Roles navigation never renders unloaded empty data", async ({ page }) => {
    await loginAsOwner(page, credentials);
    await page.goto("/dashboard/settings", { waitUntil: "domcontentloaded" });
    const accessGroup = page.locator('[data-settings-group="access"]');
    await expect(accessGroup).toBeVisible();
    if ((await accessGroup.getAttribute("aria-expanded")) !== "true") {
      await accessGroup.click();
    }

    const usersTarget = page.locator('[data-settings-target="users"]');
    // Re-expand the access group if a delayed settings navigation rerender collapsed it.
    if (!(await usersTarget.isVisible()) && (await accessGroup.getAttribute("aria-expanded")) !== "true") {
      await accessGroup.click();
    }
    await expect(usersTarget).toBeVisible();
    await usersTarget.click();
    await expect(page).toHaveURL(/view=users/, { timeout: 20_000 });
    await expect(page.getByText("No users here yet.", { exact: true })).toHaveCount(0);
    await expect(page.locator("article.team-user-row").first()).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: "Roles", exact: true }).click();
    await expect(page).toHaveURL(/view=roles/, { timeout: 20_000 });
    await expect(page.getByText("No roles found.", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Admin Default role/ })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: /Manager Default role/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Staff Default role/ })).toBeVisible();
  });

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
      await page.goto("/dashboard/settings?view=roles", { waitUntil: "domcontentloaded" });
      await expectNoAppError(page);
      await page.getByRole("button", { name: "+ Create Custom Role", exact: true }).click();
      const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Create Role", exact: true }) }).first();

      // Recommended presets should fill the common permission choices while
      // still leaving every checkbox editable before the role is saved.
      await form.getByRole("button", { name: "Manager preset", exact: true }).click();
      await expect(form.locator('select[name="branch_scope"]')).toHaveValue("selected_branches");
      await expect(form.locator('input[name="permissions"][value="manage_employees"]')).toBeChecked();
      await form.getByRole("button", { name: "Staff preset", exact: true }).click();
      await expect(form.locator('select[name="branch_scope"]')).toHaveValue("own_branch_only");
      await expect(form.locator('input[name="permissions"][value="manage_employees"]')).not.toBeChecked();
      await form.locator('input[name="name"]').fill(roleName);
      await form.locator('input[name="description"]').fill("E2E role for queue regression testing");
      await form.locator('select[name="branch_scope"]').selectOption("own_branch_only");
      const viewQueuePermission = form.locator('input[name="permissions"][value="view_live_queue"]');
      if (await viewQueuePermission.count()) await viewQueuePermission.check();
      const callNextPermission = form.locator('input[name="permissions"][value="call_next_customer"]');
      if (await callNextPermission.count()) await callNextPermission.check();
      await form.getByRole("button", { name: "Create Role", exact: true }).click();
      await page.waitForURL((url) => url.pathname === "/dashboard/settings" && url.searchParams.get("view") === "roles" && url.searchParams.get("message") === "Custom role created successfully.", { timeout: 20_000 });
      await dismissDashboardResultModal(page, "Custom role created successfully.");

      let role = await findRoleByName(admin, owner.businessId, roleName);
      expect(role).not.toBeNull();
      expect(role?.branch_scope).toBe("own_branch_only");
      expect(role?.base_role).toBe("staff");

      // After creation QueueDrop already selects the new role and opens its
      // detail editor. Avoid depending on the sidebar button's composite
      // accessible name (it also contains the role initial and “Custom role”).
      const editForm = page.locator(`form#role-editor-${role.id}`);
      await expect(editForm).toBeVisible();
      await editForm.locator('input[name="name"]').fill(updatedRoleName);
      await editForm.locator('input[name="description"]').fill("Updated E2E role description");
      await editForm.locator('select[name="branch_scope"]').selectOption("selected_branches");
      await page.getByRole("button", { name: "Save Role & Permissions", exact: true }).click();
      await page.waitForURL((url) => url.pathname === "/dashboard/settings" && url.searchParams.get("view") === "roles" && url.searchParams.get("message") === "Role permissions updated successfully.", { timeout: 20_000 });
      await dismissDashboardResultModal(page, "Role permissions updated successfully.");

      role = await findRoleByName(admin, owner.businessId, updatedRoleName);
      expect(role).not.toBeNull();
      expect(role?.branch_scope).toBe("selected_branches");
      expect(role?.base_role).toBe("manager");

      // Custom roles are deletable from the same role editor. Protected roles
      // never expose this action, while an unused custom role should delete cleanly.
      await page.getByRole("button", { name: "Delete Role", exact: true }).click();
      const deleteDialog = page.getByRole("dialog").filter({ hasText: `Delete role ${updatedRoleName}?` });
      await expect(deleteDialog).toBeVisible();
      await deleteDialog.getByRole("button", { name: "Yes", exact: true }).click();
      await page.waitForURL((url) => url.pathname === "/dashboard/settings" && url.searchParams.get("view") === "roles" && url.searchParams.get("message") === "Custom role deleted successfully.", { timeout: 20_000 });
      await dismissDashboardResultModal(page, "Custom role deleted successfully.");
      expect(await findRoleByName(admin, owner.businessId, updatedRoleName)).toBeNull();
    } finally {
      await cleanupRoleByName(admin, owner.businessId, roleName);
      await cleanupRoleByName(admin, owner.businessId, updatedRoleName);
    }
  });

  test("Scenario 14 - team member create, update, deactivate/reactivate, and delete", async ({ page }) => {
    // This is a deliberately long lifecycle scenario with several server actions.
    // Give hosted CI enough budget without weakening any individual assertion.
    test.setTimeout(90_000);
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
      await page.goto("/dashboard/settings?view=roles", { waitUntil: "domcontentloaded" });
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

      await page.goto(`/dashboard/settings?view=users&branch=${branch.id}`, { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: "+ Add User", exact: true }).click();
      const addUserPanel = page.locator('[data-testid="team-add-user-panel"]');
      await expect(addUserPanel).toBeVisible();
      const createForm = addUserPanel.locator('form.management-form').filter({ has: page.locator('input[name="full_name"]') }).first();
      await createForm.locator('input[name="full_name"]').fill(fullName);
      await expect(createForm.locator('input[name="email"]')).toHaveAttribute("required", "");
      await createForm.locator('input[name="email"]').fill(email);
      await createForm.locator('input[name="phone"]').fill(phone);
      await createForm.getByLabel("Assigned Role").selectOption({ label: roleName });
      await createForm.locator('input[name="temporary_password"]').fill("E2Epass123!");
      await createForm.getByRole("button", { name: "Create user", exact: true }).click();
      await page.waitForURL((url) => url.pathname === "/dashboard/settings" && url.searchParams.get("view") === "users" && url.searchParams.get("message")?.startsWith("Team member created successfully."), { timeout: 25_000 });
      await dismissDashboardResultModal(page, "Team member created successfully.");

      let authUser = await findAuthUserByEmail(admin, email);
      expect(authUser).not.toBeNull();
      let profile = await getProfile(admin, authUser.id);
      expect(profile?.full_name).toBe(fullName);
      expect(profile?.phone).toBe(phone);
      let membership = await getBusinessMembership(admin, owner.businessId, authUser.id);
      expect(membership?.role_id).toBe(role.id);
      expect(membership?.is_active).toBe(true);

      let memberCard = page.locator("article.team-user-row", { hasText: fullName });
      await expect(memberCard).toBeVisible();
      await memberCard.getByRole("button", { name: `Edit ${fullName}`, exact: true }).click();
      let editDialog = page.getByRole("dialog", { name: "Edit user" });
      await editDialog.locator('input[name="full_name"]').fill(updatedName);
      await editDialog.locator('select').filter({ has: page.locator('option[value="true"]') }).selectOption("false");
      await editDialog.getByRole("button", { name: "Save details", exact: true }).click();
      const confirmUpdate = page.getByRole("dialog").filter({ hasText: "Save user details?" });
      await confirmUpdate.getByRole("button", { name: "Yes, save", exact: true }).click();
      await page.waitForURL((url) => url.searchParams.get("message") === "Team member details updated successfully.", { timeout: 25_000 });
      await dismissDashboardResultModal(page, "Team member details updated successfully.");

      authUser = await findAuthUserByEmail(admin, email);
      profile = await getProfile(admin, authUser.id);
      expect(profile?.full_name).toBe(updatedName);
      membership = await getBusinessMembership(admin, owner.businessId, authUser.id);
      expect(membership?.is_active).toBe(false);

      // Reactivate using the same edit flow so both access states are covered.
      memberCard = page.locator("article.team-user-row", { hasText: updatedName });
      await expect(memberCard).toBeVisible();
      await memberCard.getByRole("button", { name: `Edit ${updatedName}`, exact: true }).click();
      editDialog = page.getByRole("dialog", { name: "Edit user" });
      await editDialog.locator('select').filter({ has: page.locator('option[value="true"]') }).selectOption("true");
      await editDialog.getByRole("button", { name: "Save details", exact: true }).click();
      await page.getByRole("dialog").filter({ hasText: "Save user details?" }).getByRole("button", { name: "Yes, save", exact: true }).click();
      await page.waitForURL((url) => url.searchParams.get("message") === "Team member details updated successfully.", { timeout: 25_000 });
      await dismissDashboardResultModal(page, "Team member details updated successfully.");
      membership = await getBusinessMembership(admin, owner.businessId, authUser.id);
      expect(membership?.is_active).toBe(true);

      memberCard = page.locator("article.team-user-row", { hasText: updatedName });
      await expect(memberCard).toBeVisible();
      await memberCard.getByRole("button", { name: `Edit ${updatedName}`, exact: true }).click();
      editDialog = page.getByRole("dialog", { name: "Edit user" });
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
