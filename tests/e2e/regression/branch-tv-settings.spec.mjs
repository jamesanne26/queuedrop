import { test, expect } from "@playwright/test";
import { isDedicatedTestTarget } from "../helpers/test-target.mjs";
import { loginAsOwner } from "../helpers/auth.mjs";
import { hasAdminTestEnvironment, ownerCredentials } from "../helpers/env.mjs";
import {
  cleanupOwnedBranch,
  createAdminClient,
  findBranchByName,
  findServiceByName,
  getOwnerBusiness,
} from "../helpers/admin-db.mjs";
import { createBranchFromUi, createServiceFromUi, scenarioId } from "../helpers/scenario-fixtures.mjs";
import { dismissDashboardResultModal, expectNoAppError } from "../helpers/ui.mjs";

const credentials = ownerCredentials();
const adminReady = hasAdminTestEnvironment();

test("branch TV settings save service selection and render the selected layout", async ({ page }, testInfo) => {
  test.skip(!credentials || !adminReady, "Owner credentials and TEST Supabase admin variables are required.");
  const baseUrl = testInfo.project.use.baseURL;
  test.skip(!isDedicatedTestTarget(baseUrl), "TV settings test only runs against the QueueDrop TEST deployment.");
  test.setTimeout(120_000);

  const admin = createAdminClient();
  const owner = await getOwnerBusiness(admin, credentials.email);
  const id = scenarioId("tv-settings");
  const branchName = `E2E TV Branch ${id}`;

  try {
    await cleanupOwnedBranch(admin, owner.businessId, branchName);
    await loginAsOwner(page, credentials);
    await createBranchFromUi(page, branchName);
    const branch = await findBranchByName(admin, owner.businessId, branchName);
    expect(branch).not.toBeNull();

    const serviceNames = [`E2E TV A ${id}`, `E2E TV B ${id}`, `E2E TV C ${id}`];
    for (const serviceName of serviceNames) await createServiceFromUi(page, branch.id, serviceName, { queuePrefix: "TVQ" });
    const services = [];
    for (const serviceName of serviceNames) services.push(await findServiceByName(admin, branch.id, serviceName));
    expect(services.every(Boolean)).toBe(true);

    await page.goto(`/dashboard/settings?view=branch-tv&branch=${branch.id}`, { waitUntil: "domcontentloaded" });
    await expectNoAppError(page);
    const form = page.locator("form.tv-settings-form");
    await expect(form).toBeVisible();
    const countSelect = form.locator('select[name="service_count"]');
    await expect(countSelect.locator("option")).toHaveCount(6);
    await countSelect.selectOption("2");

    const checkboxes = services.map((service) => form.locator(`input[name="service_ids"][value="${service.id}"]`));
    await checkboxes[0].check();
    await checkboxes[1].check();
    await checkboxes[2].check();
    await expect(form.getByRole("alert")).toContainText("Select no more than 2 services");
    const saveButton = form.getByRole("button", { name: "Save TV settings", exact: true });
    await expect(saveButton).toBeDisabled();
    await checkboxes[2].uncheck();
    await expect(form.getByRole("alert")).toHaveCount(0);
    await expect(saveButton).toBeEnabled();
    await saveButton.click();
    await page.waitForURL((url) => url.pathname === "/dashboard/settings" && url.searchParams.get("view") === "branch-tv" && Boolean(url.searchParams.get("saved")), { timeout: 20_000 });
    await dismissDashboardResultModal(page, "TV settings saved.");

    const { data: saved, error } = await admin.from("branch_tv_settings")
      .select("branch_id,service_count,service_ids")
      .eq("branch_id", branch.id)
      .maybeSingle();
    if (error) throw error;
    expect(saved?.service_count).toBe(2);
    expect(saved?.service_ids).toEqual([services[0].id, services[1].id]);

    await page.goto(`/dashboard/tv?branch=${branch.id}`, { waitUntil: "domcontentloaded" });
    await expectNoAppError(page);
    const grid = page.locator(".tv-services-grid");
    await expect(grid).toHaveAttribute("data-service-count", "2");
    await expect(grid.locator(".tv-service-card")).toHaveCount(2);
    await expect(grid).toContainText(serviceNames[0]);
    await expect(grid).toContainText(serviceNames[1]);
    await expect(grid).not.toContainText(serviceNames[2]);
  } finally {
    await cleanupOwnedBranch(admin, owner.businessId, branchName);
  }
});
