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

test.describe("owner branch and service lifecycle", () => {
  test.skip(!credentials || !adminReady, "Owner credentials and TEST Supabase admin variables are required.");

  test("Scenario 3 - branch create, edit, status toggle, and delete", async ({ page }) => {
    // This lifecycle crosses several hosted server actions plus DB verification.
    // Keep the global suite strict while giving this intentionally long flow a
    // realistic per-scenario budget.
    test.setTimeout(90_000);
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

      await page.goto(`/dashboard/settings?view=branch-general&branch=${created.id}`, { waitUntil: "domcontentloaded" });
      const form = page.locator("form.settings-general-form-v3");
      await expect(form).toBeVisible();
      await form.locator('input[name="name"]').fill(editedName);
      await form.locator('input[name="address"]').fill("Updated E2E Address");
      const phone = form.locator('input[name="phone"]');
      if (await phone.count()) await phone.fill("09170000002");
      await form.locator('select[name="status"]').selectOption("inactive");
      await form.getByRole("button", { name: "Save Changes", exact: true }).click();
      await page.waitForURL((url) => url.pathname === "/dashboard/settings" && url.searchParams.get("message") === "Branch updated successfully.", { timeout: 20_000 });
      await dismissDashboardResultModal(page, "Branch updated successfully.");

      let updated = await getBranchById(admin, created.id);
      expect(updated?.name).toBe(editedName);
      expect(updated?.address).toBe("Updated E2E Address");
      expect(updated?.status).toBe("inactive");

      // Inactive branches must be blocked in the live queue with a clear
      // modal and an active-branch selector instead of exposing queue controls.
      await page.goto(`/dashboard/queues?branch=${created.id}`, { waitUntil: "domcontentloaded" });
      const inactiveDialog = page.getByRole("dialog", { name: "Inactive branch" });
      await expect(inactiveDialog).toBeVisible();
      await expect(inactiveDialog).toContainText(`${editedName} is inactive`);
      await expect(inactiveDialog.getByText("Queue controls are disabled for inactive branches.")).toBeVisible();
      await expect(inactiveDialog.locator("select")).toBeVisible();

      await page.goto(`/dashboard/settings?view=branch-general&branch=${created.id}`, { waitUntil: "domcontentloaded" });
      const activeForm = page.locator("form.settings-general-form-v3");
      await activeForm.locator('select[name="status"]').selectOption("active");
      await activeForm.getByRole("button", { name: "Save Changes", exact: true }).click();
      await page.waitForURL((url) => url.searchParams.get("message") === "Branch updated successfully.", { timeout: 20_000 });
      await dismissDashboardResultModal(page, "Branch updated successfully.");
      updated = await getBranchById(admin, created.id);
      expect(updated?.status).toBe("active");

      await confirmCodeDelete(page, "Delete branch");
      await page.waitForURL((url) => url.pathname === "/dashboard/settings" && url.searchParams.get("message") === "Branch deleted successfully.", { timeout: 20_000 });
      await dismissDashboardResultModal(page, "Branch deleted successfully.");
      expect(await getBranchById(admin, created.id)).toBeNull();
    } finally {
      await cleanupOwnedBranch(admin, owner.businessId, branchName);
      await cleanupOwnedBranch(admin, owner.businessId, editedName);
    }
  });

  test("Scenario 4 - service library create, assign, edit, and delete", async ({ page }) => {
    // Service-library create/assign/edit/delete spans multiple server actions and
    // catalog renders. A per-test budget prevents false timeouts on hosted CI.
    test.setTimeout(90_000);
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

      await page.goto("/dashboard/settings?view=services", { waitUntil: "domcontentloaded" });
      let article = page.locator("article.settings-catalog-row", { hasText: serviceName });
      await expect(article).toBeVisible();
      const edit = article.locator("details.settings-catalog-edit");
      await edit.locator("summary").click();
      const editForm = edit.locator("form.settings-catalog-form");
      await editForm.locator('input[name="name"]').fill(editedName);
      await editForm.locator('textarea[name="description"]').fill("Updated service description");
      await editForm.locator('input[name="queue_prefix"]').fill("UPD");
      await editForm.locator('input[name="estimated_minutes"]').fill("33");
      await editForm.getByRole("button", { name: "Save service", exact: true }).click();
      await page.waitForURL((url) => url.pathname === "/dashboard/settings" && url.searchParams.get("view") === "services" && url.searchParams.get("message") === "Service updated.", { timeout: 20_000 });
      await dismissDashboardResultModal(page, "Service updated.");

      const dbService = await getServiceById(admin, service.id);
      expect(dbService?.name).toBe(editedName);
      expect(dbService?.description).toBe("Updated service description");
      expect(dbService?.queue_prefix).toBe("UPD");
      expect(dbService?.estimated_minutes).toBe(33);

      article = page.locator("article.settings-catalog-row", { hasText: editedName });
      const deleteDetails = article.locator("details.settings-catalog-edit");
      await deleteDetails.locator("summary").click();
      await confirmCodeDelete(page, "Delete service");
      await page.waitForURL((url) => url.pathname === "/dashboard/settings" && url.searchParams.get("view") === "services" && url.searchParams.get("message") === "Service deleted from the library.", { timeout: 20_000 });
      await dismissDashboardResultModal(page, "Service deleted from the library.");
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
    await page.goto("/dashboard/settings?view=branch-general", { waitUntil: "domcontentloaded" });
    const branchesToggle = page.locator('[data-settings-group="branches"]');
    if (await branchesToggle.getAttribute("aria-expanded") !== "true") await branchesToggle.click();
    const addBranch = page.locator("details.settings-add-branch-panel-v4");
    if (!(await addBranch.getAttribute("open"))) await addBranch.locator("summary").click();
    const form = addBranch.locator("form.settings-add-branch-form-v4");
    const nameInput = form.locator('input[name="name"]');
    await nameInput.fill(invalidName);
    expect(await nameInput.evaluate((input) => input.validity.tooShort)).toBe(true);
    await form.getByRole("button", { name: "Create branch", exact: true }).click();
    await page.waitForTimeout(250);

    const { count, error } = await admin.from("branches").select("id", { count: "exact", head: true }).eq("business_id", owner.businessId).eq("name", invalidName);
    if (error) throw error;
    expect(count).toBe(0);
    await expect(page).toHaveURL(/\/dashboard\/settings/);
    await expectNoAppError(page);
  });
});
