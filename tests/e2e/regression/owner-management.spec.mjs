import { test, expect } from "@playwright/test";
import { loginAsOwner } from "../helpers/auth.mjs";
import { hasAdminTestEnvironment, ownerCredentials } from "../helpers/env.mjs";
import { cleanupOwnedBranch, createAdminClient, findBranchByName, findServiceByName, getOwnerBusiness } from "../helpers/admin-db.mjs";
import { createBranchFromUi, createServiceFromUi, scenarioId } from "../helpers/scenario-fixtures.mjs";
import { dismissDashboardResultModal, expectNoAppError } from "../helpers/ui.mjs";

const credentials = ownerCredentials();
const adminReady = hasAdminTestEnvironment();

async function confirmCodeDelete(page, buttonName) {
  await page.getByRole("button", { name: buttonName, exact: true }).click();
  let dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const continueButton = dialog.getByRole("button", { name: "Yes, continue", exact: true });
  if (await continueButton.isVisible().catch(() => false)) {
    await continueButton.click();
    dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Verification code").first()).toBeVisible();
  }
  const code = (await dialog.getByLabel("Verification code").first().textContent())?.trim();
  expect(code).toMatch(/^\d{4}$/);
  await dialog.locator("input").fill(code);
  await dialog.getByRole("button", { name: "Confirm delete", exact: true }).click();
}

test.describe("owner management scenarios", () => {
  test.skip(!credentials || !adminReady, "Owner credentials and dedicated TEST Supabase admin variables are required.");

  test("Scenario 1 - create and delete a branch independently", async ({ page }) => {
    const branchName = `E2E Branch ${scenarioId()}`;
    const admin = createAdminClient();
    const owner = await getOwnerBusiness(admin, credentials.email);
    await cleanupOwnedBranch(admin, owner.businessId, branchName);

    try {
      await loginAsOwner(page, credentials);
      await createBranchFromUi(page, branchName);
      const persisted = await findBranchByName(admin, owner.businessId, branchName);
      expect(persisted).not.toBeNull();

      await page.goto(`/dashboard/settings?view=branch-general&branch=${persisted.id}`, { waitUntil: "domcontentloaded" });
      await confirmCodeDelete(page, "Delete branch");
      await page.waitForURL((url) => url.pathname === "/dashboard/settings" && url.searchParams.get("message") === "Branch deleted successfully.", { timeout: 20_000 });
      await dismissDashboardResultModal(page, "Branch deleted successfully.");
      expect(await findBranchByName(admin, owner.businessId, branchName)).toBeNull();
    } finally {
      await cleanupOwnedBranch(admin, owner.businessId, branchName);
    }
  });

  test("Scenario 2 - create a catalog service, assign it to a branch, and verify persistence", async ({ page }) => {
    const id = scenarioId();
    const branchName = `E2E Service Branch ${id}`;
    const serviceName = `E2E Service ${id}`;
    const admin = createAdminClient();
    const owner = await getOwnerBusiness(admin, credentials.email);
    await cleanupOwnedBranch(admin, owner.businessId, branchName);

    try {
      await loginAsOwner(page, credentials);
      await createBranchFromUi(page, branchName);
      const branch = await findBranchByName(admin, owner.businessId, branchName);
      expect(branch).not.toBeNull();
      await createServiceFromUi(page, branch.id, serviceName, { queuePrefix: "E2E", estimatedMinutes: 15 });
      const persisted = await findServiceByName(admin, branch.id, serviceName);
      expect(persisted, "Assigned service was not materialized for the branch").not.toBeNull();
      await expectNoAppError(page);
    } finally {
      await cleanupOwnedBranch(admin, owner.businessId, branchName);
    }
  });
});
