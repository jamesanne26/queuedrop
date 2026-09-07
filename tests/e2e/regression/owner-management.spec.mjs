import { test, expect } from "@playwright/test";
import { loginAsOwner } from "../helpers/auth.mjs";
import { hasAdminTestEnvironment, ownerCredentials } from "../helpers/env.mjs";
import { cleanupOwnedBranch, createAdminClient, findBranchByName, findServiceByName, getOwnerBusiness } from "../helpers/admin-db.mjs";
import { dismissDashboardResultModal, expectNoAppError } from "../helpers/ui.mjs";

const credentials = ownerCredentials();
const adminReady = hasAdminTestEnvironment();

function runId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

test.describe("owner management scenarios", () => {
  test.skip(!credentials || !adminReady, "Owner credentials and dedicated TEST Supabase admin variables are required.");

  test("Scenario 1 - create and delete a branch independently", async ({ page }) => {
    const id = runId();
    const branchName = `E2E Branch ${id}`;
    const admin = createAdminClient();
    const owner = await getOwnerBusiness(admin, credentials.email);

    await cleanupOwnedBranch(admin, owner.businessId, branchName);

    try {
      await loginAsOwner(page, credentials);
      await page.goto("/dashboard/branches", { waitUntil: "domcontentloaded" });
      await expectNoAppError(page);

      const createForm = page.locator('form.management-form').filter({ has: page.locator('input[name="name"]') }).first();
      await createForm.locator('input[name="name"]').fill(branchName);
      await createForm.getByRole("button", { name: "Create branch", exact: true }).click();

      await page.waitForURL(/\/dashboard\/branches\?message=/, { timeout: 15_000 });
      await dismissDashboardResultModal(page, "Branch created successfully.");

      const row = page.locator("article.branch-row", { hasText: branchName });
      await expect(row).toBeVisible();

      const persisted = await findBranchByName(admin, owner.businessId, branchName);
      expect(persisted, "Created branch was not persisted in TEST Supabase").not.toBeNull();

      await row.getByRole("button", { name: "Delete", exact: true }).click();
      const confirmDialog = page.getByRole("dialog", { name: new RegExp(`Delete ${branchName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) });
      await expect(confirmDialog).toBeVisible();
      await confirmDialog.getByRole("button", { name: "Yes, delete branch", exact: true }).click();

      await page.waitForURL(/\/dashboard\/branches\?message=/, { timeout: 15_000 });
      await dismissDashboardResultModal(page, "Branch deleted successfully.");
      await expect(page.locator("article.branch-row", { hasText: branchName })).toHaveCount(0);

      const deleted = await findBranchByName(admin, owner.businessId, branchName);
      expect(deleted, "Deleted branch still exists in TEST Supabase").toBeNull();
    } finally {
      await cleanupOwnedBranch(admin, owner.businessId, branchName);
    }
  });

  test("Scenario 2 - create a service in scenario-owned branch and verify persistence", async ({ page }) => {
    const id = runId();
    const branchName = `E2E Service Branch ${id}`;
    const serviceName = `E2E Service ${id}`;
    const admin = createAdminClient();
    const owner = await getOwnerBusiness(admin, credentials.email);

    await cleanupOwnedBranch(admin, owner.businessId, branchName);

    try {
      await loginAsOwner(page, credentials);
      await page.goto("/dashboard/branches", { waitUntil: "domcontentloaded" });
      await expectNoAppError(page);

      const branchForm = page.locator('form.management-form').filter({ has: page.locator('input[name="name"]') }).first();
      await branchForm.locator('input[name="name"]').fill(branchName);
      await branchForm.getByRole("button", { name: "Create branch", exact: true }).click();

      await page.waitForURL(/\/dashboard\/branches\?message=/, { timeout: 15_000 });
      await dismissDashboardResultModal(page, "Branch created successfully.");

      const branch = await findBranchByName(admin, owner.businessId, branchName);
      expect(branch, "Scenario-owned branch was not persisted").not.toBeNull();

      await page.goto(`/dashboard/services?branch=${branch.id}`, { waitUntil: "domcontentloaded" });
      await expectNoAppError(page);

      const serviceForm = page.locator('form.management-form').filter({ has: page.locator('input[name="queue_prefix"]') }).first();
      await expect(serviceForm).toBeVisible();
      await serviceForm.locator('input[name="name"]').fill(serviceName);
      await serviceForm.locator('input[name="queue_prefix"]').fill("E2E");
      await serviceForm.locator('input[name="estimated_minutes"]').fill("15");
      await serviceForm.getByRole("button", { name: "Create service", exact: true }).click();

      await page.waitForURL((url) => url.pathname === "/dashboard/services" && url.searchParams.get("message") === "Service created successfully.", { timeout: 15_000 });
      await dismissDashboardResultModal(page, "Service created successfully.");

      await expect(page.locator("article", { hasText: serviceName }).first()).toBeVisible();
      const persisted = await findServiceByName(admin, branch.id, serviceName);
      expect(persisted, "Created service was not persisted in TEST Supabase").not.toBeNull();
    } finally {
      await cleanupOwnedBranch(admin, owner.businessId, branchName);
    }
  });
});
