import { test, expect } from "@playwright/test";
import { loginAsOwner } from "../helpers/auth.mjs";
import { hasAdminTestEnvironment, ownerCredentials } from "../helpers/env.mjs";
import {
  cleanupOwnedBranch,
  createAdminClient,
  findBranchByName,
  findServiceByName,
  getOwnerBusiness,
  getPositionNotificationRules,
  getQueueConfiguration,
  getTicketById,
  latestTicketForService,
} from "../helpers/admin-db.mjs";
import { createBranchFromUi, createServiceFromUi, scenarioId } from "../helpers/scenario-fixtures.mjs";
import { dismissDashboardResultModal, expectNoAppError } from "../helpers/ui.mjs";

const credentials = ownerCredentials();
const adminReady = hasAdminTestEnvironment();

async function setupBranch(page, admin, owner, id) {
  const branchName = `E2E Settings Branch ${id}`;
  await cleanupOwnedBranch(admin, owner.businessId, branchName);
  await loginAsOwner(page, credentials);
  await createBranchFromUi(page, branchName);
  const branch = await findBranchByName(admin, owner.businessId, branchName);
  expect(branch).not.toBeNull();
  return { branchName, branch };
}

async function setupReportWorkspace(page, admin, owner, id) {
  const data = await setupBranch(page, admin, owner, id);
  const serviceName = `E2E Reports Service ${id}`;
  await createServiceFromUi(page, data.branch.id, serviceName, { queuePrefix: "REP", estimatedMinutes: 12 });
  const service = await findServiceByName(admin, data.branch.id, serviceName);
  expect(service).not.toBeNull();
  return { ...data, serviceName, service };
}

test.describe("owner settings and reports", () => {
  test.skip(!credentials || !adminReady, "Owner credentials and TEST Supabase admin variables are required.");

  test("Scenario 11 - branch settings save and database persistence", async ({ page }) => {
    // This scenario performs multiple hosted server actions and database checks.
    // Keep its timeout scoped to this test, while avoiding unnecessary service setup.
    test.setTimeout(process.env.CI ? 90_000 : 60_000);
    const id = scenarioId("settings");
    const admin = createAdminClient();
    const owner = await getOwnerBusiness(admin, credentials.email);
    let branchName = "";
    try {
      const data = await setupBranch(page, admin, owner, id);
      branchName = data.branchName;
      // Queue behavior and notifications are separate Settings views now. Verify
      // each form at its current route instead of relying on the legacy combined form.
      await page.goto(`/dashboard/settings?view=branch-queue&branch=${data.branch.id}`, { waitUntil: "domcontentloaded" });
      await expectNoAppError(page);
      const queueForm = page.locator('form[action]').filter({ has: page.locator('input[name="customer_refresh_seconds"]') }).first();
      await expect(queueForm).toBeVisible();
      await queueForm.locator('input[name="customer_refresh_seconds"]').fill("11");
      await queueForm.getByRole("button", { name: "Save branch settings", exact: true }).click();
      let review = page.getByRole("dialog");
      await expect(review).toBeVisible();
      await review.getByRole("button", { name: "Confirm save", exact: true }).click();
      await page.waitForURL((url) => url.pathname === "/dashboard/settings" && url.searchParams.get("view") === "branch-queue" && url.searchParams.get("message") === "Branch settings saved.", { timeout: 20_000 });
      await dismissDashboardResultModal(page, "Branch settings saved.");

      await page.goto(`/dashboard/settings?view=branch-notifications&branch=${data.branch.id}`, { waitUntil: "domcontentloaded" });
      const notificationsForm = page.locator('form[action]').filter({ has: page.locator('input[name="position_rule_count"]') }).first();
      await expect(notificationsForm).toBeVisible();
      await expect(notificationsForm.locator('input[name="position_rule_count"]')).toHaveValue("3");
      await expect(notificationsForm.locator('input[name="position_rule_0_position"]')).toHaveValue("1");
      await expect(notificationsForm.locator('input[name="position_rule_1_position"]')).toHaveValue("2");
      await expect(notificationsForm.locator('input[name="position_rule_2_position"]')).toHaveValue("3");
      await expect(notificationsForm.locator('input[name="position_rule_0_sms"]')).not.toBeChecked();
      await expect(notificationsForm.locator('input[name="position_rule_1_sms"]')).not.toBeChecked();
      await expect(notificationsForm.locator('input[name="position_rule_2_sms"]')).not.toBeChecked();
      await notificationsForm.locator('input[name="position_rule_0_browser"]').check();
      await notificationsForm.locator('input[name="position_rule_1_sms"]').check();
      await notificationsForm.getByRole("button", { name: "Save branch settings", exact: true }).click();
      review = page.getByRole("dialog");
      await expect(review).toBeVisible();
      await review.getByRole("button", { name: "Confirm save", exact: true }).click();
      await page.waitForURL((url) => url.pathname === "/dashboard/settings" && url.searchParams.get("view") === "branch-notifications" && url.searchParams.get("message") === "Branch settings saved.", { timeout: 20_000 });
      await dismissDashboardResultModal(page, "Branch settings saved.");

      const config = await getQueueConfiguration(admin, data.branch.id);
      expect(config?.customer_refresh_seconds).toBe(11);
      const notificationRules = await getPositionNotificationRules(admin, data.branch.id);
      expect(notificationRules).toEqual([
        expect.objectContaining({ position: 1, browser_notification: true, send_sms_once: false }),
        expect.objectContaining({ position: 2, browser_notification: false, send_sms_once: true }),
        expect.objectContaining({ position: 3, browser_notification: false, send_sms_once: false }),
      ]);

      await page.goto(`/dashboard/settings?view=branch-queue&branch=${data.branch.id}`, { waitUntil: "domcontentloaded" });
      const reloaded = page.locator('form[action]').filter({ has: page.locator('input[name="customer_refresh_seconds"]') }).first();
      await expect(reloaded.locator('input[name="customer_refresh_seconds"]')).toHaveValue("11");
    } finally {
      if (branchName) await cleanupOwnedBranch(admin, owner.businessId, branchName);
    }
  });

  test("Scenario 12 - completed queue record appears in filtered reports and CSV export", async ({ page }) => {
    // Queue lifecycle + reports render + export is a multi-action integration flow.
    // Give it the same realistic budget as the dedicated queue happy-path test.
    test.setTimeout(90_000);
    const id = scenarioId("reports");
    const admin = createAdminClient();
    const owner = await getOwnerBusiness(admin, credentials.email);
    let branchName = "";
    try {
      const data = await setupReportWorkspace(page, admin, owner, id);
      branchName = data.branchName;
      await page.goto(`/dashboard/queues?branch=${data.branch.id}&service=${data.service.id}`, { waitUntil: "domcontentloaded" });
      const getStubButton = page.getByRole("button", { name: /Get test stub/i });
      await getStubButton.click();
      await expect(page.getByText(/Test stub .* issued|Test stub issued/i).first()).toBeVisible({ timeout: 20_000 });
      await expect.poll(async () => Boolean(await latestTicketForService(admin, data.branch.id, data.service.id)), { timeout: 30_000 }).toBe(true);
      const ticket = await latestTicketForService(admin, data.branch.id, data.service.id);
      expect(ticket).not.toBeNull();
      expect(ticket.status).toBe("waiting");
      await expect(page.locator(".live-waiting-panel")).toContainText(ticket.display_number, { timeout: 20_000 });
      await expect(getStubButton).toBeEnabled({ timeout: 20_000 });

      const callNext = page.getByRole("button", { name: "Call next", exact: true });
      await expect(callNext).toBeEnabled();
      await callNext.click();
      await expect.poll(async () => (await getTicketById(admin, ticket.id))?.status, { timeout: 20_000 }).toBe("called");
      await expect(page.locator(".live-pending-panel")).toContainText(ticket.display_number, { timeout: 20_000 });
      await page.locator(".live-pending-row-v4", { hasText: ticket.display_number }).getByRole("button", { name: "Move to serving", exact: true }).click();
      await expect.poll(async () => (await getTicketById(admin, ticket.id))?.status, { timeout: 15_000 }).toBe("serving");
      await page.locator(".live-serving-row-v4", { hasText: ticket.display_number }).getByRole("button", { name: "Complete", exact: true }).click();
      await expect.poll(async () => (await getTicketById(admin, ticket.id))?.status, { timeout: 15_000 }).toBe("completed");

      const today = new Date().toISOString().slice(0, 10);
      const query = new URLSearchParams({ from: today, to: today, branch: data.branch.id, service: data.service.id, status: "completed", report: "history" });
      await page.goto(`/dashboard/reports?${query.toString()}`, { waitUntil: "domcontentloaded" });
      await expectNoAppError(page);
      await expect(page.locator(".reports-history-card")).toContainText(ticket.display_number);
      await expect(page.locator(".reports-history-card")).toContainText(data.branchName);
      await expect(page.locator(".reports-history-card")).toContainText(data.serviceName);
      await expect(page.locator(".reports-history-card")).toContainText("completed");

      const response = await page.request.get(`/api/reports/export?${query.toString()}&format=csv`);
      expect(response.ok()).toBe(true);
      expect(response.headers()["content-type"]).toContain("text/csv");
      const csv = await response.text();
      expect(csv).toContain(ticket.display_number);
      expect(csv).toContain(data.branchName);
      expect(csv).toContain(data.serviceName);
    } finally {
      if (branchName) await cleanupOwnedBranch(admin, owner.businessId, branchName);
    }
  });
});
