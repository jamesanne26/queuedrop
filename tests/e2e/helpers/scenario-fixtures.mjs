import { expect } from "@playwright/test";
import { dismissDashboardResultModal, expectNoAppError } from "./ui.mjs";

export function scenarioId(prefix = "") {
  const value = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return prefix ? `${prefix}-${value}` : value;
}

export async function createBranchFromUi(page, branchName, { address = "", phone = "" } = {}) {
  await page.goto("/dashboard/branches", { waitUntil: "domcontentloaded" });
  await expectNoAppError(page);
  const form = page.locator('form.management-form').filter({ has: page.locator('input[name="name"]') }).first();
  await expect(form).toBeVisible();
  await form.locator('input[name="name"]').fill(branchName);
  if (address) await form.locator('input[name="address"]').fill(address);
  if (phone) await form.locator('input[name="phone"]').fill(phone);
  await form.getByRole("button", { name: "Create branch", exact: true }).click();
  await page.waitForURL(/\/dashboard\/branches\?message=/, { timeout: 20_000 });
  await dismissDashboardResultModal(page, "Branch created successfully.");
}

export async function createServiceFromUi(page, branchId, serviceName, { description = "", queuePrefix = "E2E", estimatedMinutes = 15 } = {}) {
  await page.goto(`/dashboard/services?branch=${branchId}`, { waitUntil: "domcontentloaded" });
  await expectNoAppError(page);
  const form = page.locator('form.management-form').filter({ has: page.locator('input[name="queue_prefix"]') }).first();
  await expect(form).toBeVisible();
  await form.locator('input[name="name"]').fill(serviceName);
  if (description) await form.locator('textarea[name="description"]').fill(description);
  if (queuePrefix) await form.locator('input[name="queue_prefix"]').fill(queuePrefix);
  if (estimatedMinutes) await form.locator('input[name="estimated_minutes"]').fill(String(estimatedMinutes));
  await form.getByRole("button", { name: "Create service", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/dashboard/services" && url.searchParams.get("message") === "Service created successfully.", { timeout: 20_000 });
  await dismissDashboardResultModal(page, "Service created successfully.");
}

export async function expectNotice(page, text) {
  await expect(page.locator("body")).toContainText(text, { timeout: 15_000 });
  await expectNoAppError(page);
}
