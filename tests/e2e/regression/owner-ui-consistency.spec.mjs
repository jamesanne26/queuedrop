import { test, expect } from "@playwright/test";
import { loginAsOwner } from "../helpers/auth.mjs";
import { hasAdminTestEnvironment, ownerCredentials } from "../helpers/env.mjs";
import { cleanupRoleByName, createAdminClient, findRoleByName, getOwnerBusiness } from "../helpers/admin-db.mjs";
import { scenarioId } from "../helpers/scenario-fixtures.mjs";
import { dismissDashboardResultModal, expectNoAppError } from "../helpers/ui.mjs";

const credentials = ownerCredentials();
const adminReady = hasAdminTestEnvironment();

test.describe("owner UI consistency contracts", () => {
  test.skip(!credentials, "E2E_OWNER_EMAIL and E2E_OWNER_PASSWORD are required.");

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsOwner(page, credentials);
  });

  test("desktop sidebar stays compact", async ({ page }) => {
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    const sidebar = page.locator(".dashboard-shell > .sidebar");
    await expect(sidebar).toBeVisible();
    const box = await sidebar.boundingBox();
    expect(box).not.toBeNull();
    expect(box.width).toBeGreaterThanOrEqual(185);
    expect(box.width).toBeLessThanOrEqual(220);
    await expectNoAppError(page);
  });

  test("role toolbar actions use the same dimensions", async ({ page }) => {
    test.skip(!adminReady, "TEST Supabase admin variables are required for deterministic role setup.");

    const id = scenarioId("ui-role-toolbar");
    const roleName = `E2E UI Role ${id}`;
    const admin = createAdminClient();
    const owner = await getOwnerBusiness(admin, credentials.email);
    await cleanupRoleByName(admin, owner.businessId, roleName);

    try {
      await page.goto("/dashboard/settings?view=roles", { waitUntil: "domcontentloaded" });
      await expectNoAppError(page);

      await page.getByRole("button", { name: "+ Create Custom Role", exact: true }).click();
      const createForm = page.locator("form#role-editor-create");
      await expect(createForm).toBeVisible();
      await createForm.locator('input[name="name"]').fill(roleName);
      await createForm.locator('input[name="description"]').fill("E2E role for toolbar dimension regression");
      await createForm.locator('select[name="branch_scope"]').selectOption("selected_branches");
      await createForm.getByRole("button", { name: "Create Role", exact: true }).click();

      await page.waitForURL((url) =>
        url.pathname === "/dashboard/settings" &&
        url.searchParams.get("view") === "roles" &&
        url.searchParams.get("message") === "Custom role created successfully.",
      { timeout: 20_000 });
      await dismissDashboardResultModal(page, "Custom role created successfully.");

      const role = await findRoleByName(admin, owner.businessId, roleName);
      expect(role).not.toBeNull();
      await expect(page.locator(`form#role-editor-${role.id}`)).toBeVisible();

      const save = page.getByRole("button", { name: "Save Role & Permissions", exact: true });
      const create = page.getByRole("button", { name: "+ Create Custom Role", exact: true });
      await expect(save).toBeVisible();
      await expect(create).toBeVisible();

      const [saveBox, createBox] = await Promise.all([save.boundingBox(), create.boundingBox()]);
      expect(saveBox).not.toBeNull();
      expect(createBox).not.toBeNull();
      expect(Math.abs(saveBox.width - createBox.width)).toBeLessThanOrEqual(2);
      expect(Math.abs(saveBox.height - createBox.height)).toBeLessThanOrEqual(2);
    } finally {
      await cleanupRoleByName(admin, owner.businessId, roleName);
    }
  });

  test("branch save and delete actions are equal-sized and visually grouped", async ({ page }) => {
    await page.goto("/dashboard/settings?view=branch-general", { waitUntil: "domcontentloaded" });
    await expectNoAppError(page);
    const save = page.getByRole("button", { name: "Save Changes", exact: true });
    const del = page.getByRole("button", { name: "Delete branch", exact: true });
    await expect(save).toBeVisible();
    if (!(await del.isVisible().catch(() => false))) test.skip(true, "Delete branch is not available to this account.");
    const [saveBox, deleteBox] = await Promise.all([save.boundingBox(), del.boundingBox()]);
    expect(saveBox).not.toBeNull();
    expect(deleteBox).not.toBeNull();
    expect(Math.abs(saveBox.width - deleteBox.width)).toBeLessThanOrEqual(2);
    expect(Math.abs(saveBox.height - deleteBox.height)).toBeLessThanOrEqual(2);
    const verticalGap = deleteBox.y - (saveBox.y + saveBox.height);
    expect(verticalGap).toBeGreaterThanOrEqual(0);
    expect(verticalGap).toBeLessThanOrEqual(28);
  });
});
