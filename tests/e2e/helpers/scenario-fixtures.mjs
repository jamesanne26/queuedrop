import { expect } from "@playwright/test";
import { dismissDashboardResultModal, expectNoAppError } from "./ui.mjs";

export function scenarioId(prefix = "") {
  const value = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return prefix ? `${prefix}-${value}` : value;
}

export async function createBranchFromUi(page, branchName, { address = "", phone = "" } = {}) {
  await page.goto("/dashboard/settings?view=branch-general", { waitUntil: "domcontentloaded" });
  await expectNoAppError(page);

  const branchesToggle = page.locator('[data-settings-group="branches"]');
  if (await branchesToggle.getAttribute("aria-expanded") !== "true") await branchesToggle.click();

  const addBranch = page.locator("details.settings-add-branch-panel-v4");
  if (!(await addBranch.getAttribute("open"))) await addBranch.locator("summary").click();
  const form = addBranch.locator("form.settings-add-branch-form-v4");
  await expect(form).toBeVisible();
  await form.locator('input[name="name"]').fill(branchName);
  if (address) await form.locator('input[name="address"]').fill(address);
  if (phone) await form.locator('input[name="phone"]').fill(phone);
  await form.getByRole("button", { name: "Create branch", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/dashboard/settings" && url.searchParams.get("message") === "Branch created successfully.", { timeout: 20_000 });
  await dismissDashboardResultModal(page, "Branch created successfully.");
}

export async function createServiceFromUi(page, branchId, serviceName, { description = "", queuePrefix = "E2E", estimatedMinutes = 15 } = {}) {
  await page.goto("/dashboard/settings?view=services", { waitUntil: "domcontentloaded" });
  await expectNoAppError(page);

  const addService = page.locator("details.settings-catalog-create");
  if (!(await addService.getAttribute("open"))) await addService.locator("summary").click();
  const form = addService.locator("form.settings-catalog-form").first();
  await expect(form).toBeVisible();
  await form.locator('input[name="name"]').fill(serviceName);
  if (description) await form.locator('textarea[name="description"]').fill(description);
  if (queuePrefix) await form.locator('input[name="queue_prefix"]').fill(queuePrefix);
  if (estimatedMinutes) await form.locator('input[name="estimated_minutes"]').fill(String(estimatedMinutes));
  await form.getByRole("button", { name: "Create service", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/dashboard/settings" && url.searchParams.get("view") === "services" && url.searchParams.get("message") === "Service added to the business service library.", { timeout: 20_000 });
  await dismissDashboardResultModal(page, "Service added to the business service library.");

  await page.goto(`/dashboard/settings?view=branch-services&branch=${branchId}`, { waitUntil: "domcontentloaded" });
  await expectNoAppError(page);
  const assignForm = page.locator("form.settings-service-picker");
  await expect(assignForm).toBeVisible();
  await assignForm.locator('select[name="service_key"]').selectOption({ label: serviceName });
  await assignForm.getByRole("button", { name: "Add to branch", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/dashboard/settings" && url.searchParams.get("view") === "branch-services" && url.searchParams.get("message") === "Service added to this branch.", { timeout: 20_000 });
  await dismissDashboardResultModal(page, "Service added to this branch.");
}

export async function expectNotice(page, text) {
  await expect(page.locator("body")).toContainText(text, { timeout: 15_000 });
  await expectNoAppError(page);
}
