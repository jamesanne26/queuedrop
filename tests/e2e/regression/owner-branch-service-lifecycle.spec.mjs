import { test, expect } from "@playwright/test";
import { loginAsOwner } from "../helpers/auth.mjs";
import { hasAdminTestEnvironment, ownerCredentials } from "../helpers/env.mjs";
import {
  cleanupOwnedBranch,
  createAdminClient,
  findBranchByName,
  findServiceByName,
  getBranchById,
  getOwnerBusiness,
  getServiceById,
} from "../helpers/admin-db.mjs";
import { createBranchFromUi, createServiceFromUi, scenarioId } from "../helpers/scenario-fixtures.mjs";
import { dismissDashboardResultModal, expectNoAppError } from "../helpers/ui.mjs";

const credentials = ownerCredentials();
const adminReady = hasAdminTestEnvironment();

test.describe("owner branch and service lifecycle", () => {
  test.skip(!credentials || !adminReady, "Owner credentials and TEST Supabase admin variables are required.");

  test("Scenario 3 - branch create, edit, status toggle, and delete", async ({ page }) => {
    const id = scenarioId("branch-life");
    const branchName = `E2E Lifecycle Branch ${id}`;
    const editedName = `${branchName} Edited`;
    const admin = createAdminClient();
    const owner = await getOwnerBusiness(admin, credentials.email);
    await cleanupOwnedBranch(admin, owner.businessId, branchName);
    await cleanupOwnedBranch(admin, owner.businessId, editedName);

    try {
      await loginAsOwner(page, credentials);
      await createBranchFromUi(page, branchName, { address: "Initial E2E Address", phone: "09170000001" });
      const created = await findBranchByName(admin, owner.businessId, branchName);
      expect(created).not.toBeNull();

      const row = page.locator("article.branch-row", { hasText: branchName });
      await row.getByRole("button", { name: "Edit", exact: true }).click();
      const editDialog = page.getByRole("dialog", { name: "Edit branch" });
      await expect(editDialog).toBeVisible();
      await editDialog.locator('input[name="name"]').fill(editedName);
      await editDialog.locator('input[name="address"]').fill("Updated E2E Address");
      await editDialog.locator('input[name="phone"]').fill("09170000002");
      await editDialog.locator('select[name="status"]').selectOption("active");
      await editDialog.getByRole("button", { name: "Save branch", exact: true }).click();
      await page.waitForURL(/\/dashboard\/branches\?message=/, { timeout: 20_000 });
      await dismissDashboardResultModal(page, "Branch updated successfully.");

      const updated = await getBranchById(admin, created.id);
      expect(updated?.name).toBe(editedName);
      expect(updated?.address).toBe("Updated E2E Address");
      expect(updated?.phone).toBe("09170000002");
      expect(updated?.status).toBe("active");

      // Owner/admin status changes are performed through the Edit branch dialog.
      // The standalone “Set inactive/active” button is only rendered for users
      // who may change status but cannot fully manage the branch.
      let updatedRow = page.locator("article.branch-row", { hasText: editedName });
      await updatedRow.getByRole("button", { name: "Edit", exact: true }).click();
      let statusDialog = page.getByRole("dialog", { name: "Edit branch" });
      await statusDialog.locator('select[name="status"]').selectOption("inactive");
      await statusDialog.getByRole("button", { name: "Save branch", exact: true }).click();
      await page.waitForURL(/\/dashboard\/branches\?message=/, { timeout: 20_000 });
      await dismissDashboardResultModal(page, "Branch updated successfully.");
      expect((await getBranchById(admin, created.id))?.status).toBe("inactive");

      updatedRow = page.locator("article.branch-row", { hasText: editedName });
      await updatedRow.getByRole("button", { name: "Edit", exact: true }).click();
      statusDialog = page.getByRole("dialog", { name: "Edit branch" });
      await statusDialog.locator('select[name="status"]').selectOption("active");
      await statusDialog.getByRole("button", { name: "Save branch", exact: true }).click();
      await page.waitForURL(/\/dashboard\/branches\?message=/, { timeout: 20_000 });
      await dismissDashboardResultModal(page, "Branch updated successfully.");
      expect((await getBranchById(admin, created.id))?.status).toBe("active");

      const activeRow = page.locator("article.branch-row", { hasText: editedName });
      await activeRow.getByRole("button", { name: "Delete", exact: true }).click();
      const deleteDialog = page.getByRole("dialog", { name: new RegExp(`Delete ${editedName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) });
      await deleteDialog.getByRole("button", { name: "Yes, delete branch", exact: true }).click();
      await page.waitForURL(/\/dashboard\/branches\?message=/, { timeout: 20_000 });
      await dismissDashboardResultModal(page, "Branch deleted successfully.");
      expect(await getBranchById(admin, created.id)).toBeNull();
    } finally {
      await cleanupOwnedBranch(admin, owner.businessId, branchName);
      await cleanupOwnedBranch(admin, owner.businessId, editedName);
    }
  });

  test("Scenario 4 - service create, edit, deactivate, reactivate, and delete", async ({ page }) => {
    const id = scenarioId("service-life");
    const branchName = `E2E Service Lifecycle Branch ${id}`;
    const serviceName = `E2E Service Lifecycle ${id}`;
    const editedName = `${serviceName} Updated`;
    const admin = createAdminClient();
    const owner = await getOwnerBusiness(admin, credentials.email);
    await cleanupOwnedBranch(admin, owner.businessId, branchName);

    try {
      await loginAsOwner(page, credentials);
      await createBranchFromUi(page, branchName);
      const branch = await findBranchByName(admin, owner.businessId, branchName);
      expect(branch).not.toBeNull();
      await createServiceFromUi(page, branch.id, serviceName, { description: "Initial service description", queuePrefix: "LIF", estimatedMinutes: 21 });
      const service = await findServiceByName(admin, branch.id, serviceName);
      expect(service).not.toBeNull();

      let article = page.locator("article", { hasText: serviceName }).first();
      await article.getByRole("button", { name: "Edit", exact: true }).click();
      const editDialog = page.getByRole("dialog", { name: "Edit service" });
      await editDialog.locator('input[name="name"]').fill(editedName);
      await editDialog.locator('textarea[name="description"]').fill("Updated service description");
      await editDialog.locator('input[name="queue_prefix"]').fill("UPD");
      await editDialog.locator('input[name="estimated_minutes"]').fill("33");
      await editDialog.getByRole("button", { name: "Save service", exact: true }).click();
      await page.waitForURL((url) => url.pathname === "/dashboard/services" && url.searchParams.get("message") === "Service updated successfully.", { timeout: 20_000 });
      await dismissDashboardResultModal(page, "Service updated successfully.");

      let dbService = await getServiceById(admin, service.id);
      expect(dbService?.name).toBe(editedName);
      expect(dbService?.description).toBe("Updated service description");
      expect(dbService?.queue_prefix).toBe("UPD");
      expect(dbService?.estimated_minutes).toBe(33);

      article = page.locator("article", { hasText: editedName }).first();
      await article.getByRole("button", { name: "Deactivate", exact: true }).click();
      const deactivateDialog = page.getByRole("dialog");
      await expect(deactivateDialog).toContainText("Deactivate");
      await deactivateDialog.getByRole("button", { name: "Deactivate", exact: true }).click();
      await page.waitForURL((url) => url.pathname === "/dashboard/services" && url.searchParams.get("message") === "Service deactivated.", { timeout: 20_000 });
      await dismissDashboardResultModal(page, "Service deactivated.");
      expect((await getServiceById(admin, service.id))?.is_active).toBe(false);

      article = page.locator("article", { hasText: editedName }).first();
      await article.getByRole("button", { name: "Activate", exact: true }).click();
      const activateDialog = page.getByRole("dialog");
      await activateDialog.getByRole("button", { name: "Activate", exact: true }).click();
      await page.waitForURL((url) => url.pathname === "/dashboard/services" && url.searchParams.get("message") === "Service activated.", { timeout: 20_000 });
      await dismissDashboardResultModal(page, "Service activated.");
      expect((await getServiceById(admin, service.id))?.is_active).toBe(true);

      article = page.locator("article", { hasText: editedName }).first();
      await article.getByRole("button", { name: "Delete", exact: true }).click();
      const deleteDialog = page.getByRole("dialog", { name: "Delete service?" });
      await deleteDialog.getByRole("button", { name: "Delete service", exact: true }).click();
      await page.waitForURL((url) => url.pathname === "/dashboard/services" && url.searchParams.get("message") === "Service deleted successfully.", { timeout: 20_000 });
      await dismissDashboardResultModal(page, "Service deleted successfully.");
      expect(await getServiceById(admin, service.id)).toBeNull();
    } finally {
      await cleanupOwnedBranch(admin, owner.businessId, branchName);
    }
  });

  test("Scenario 5 - invalid short branch name is blocked and creates no record", async ({ page }) => {
    const invalidName = "X";
    const admin = createAdminClient();
    const owner = await getOwnerBusiness(admin, credentials.email);

    await loginAsOwner(page, credentials);
    await page.goto("/dashboard/branches", { waitUntil: "domcontentloaded" });
    const form = page.locator('form.management-form').filter({ has: page.locator('input[name="name"]') }).first();
    const nameInput = form.locator('input[name="name"]');
    await nameInput.fill(invalidName);

    expect(await nameInput.evaluate((input) => input.validity.tooShort)).toBe(true);
    await form.getByRole("button", { name: "Create branch", exact: true }).click();
    await page.waitForTimeout(300);

    const { count, error } = await admin
      .from("branches")
      .select("id", { count: "exact", head: true })
      .eq("business_id", owner.businessId)
      .eq("name", invalidName);
    if (error) throw error;
    expect(count).toBe(0);
    await expect(page).toHaveURL(/\/dashboard\/branches(?:$|\?)/);
    await expectNoAppError(page);
  });
});
