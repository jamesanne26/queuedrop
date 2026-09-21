import { expect } from "@playwright/test";
import { dismissDashboardResultModal, expectNoAppError } from "./ui.mjs";

export function scenarioId(prefix = "") {
  const value = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return prefix ? `${prefix}-${value}` : value;
}

export async function createBranchFromUi(page, branchName, { address = "", phone = "", _retried = false } = {}) {
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

  // Hosted CI can occasionally reach the branch action with an authenticated page
  // while the server-side Supabase request has lost its auth context. Retry the
  // operation once after a fresh login, but only for this exact authorization
  // failure; all other branch-create errors still fail immediately.
  await page.waitForURL((url) => {
    if (url.pathname !== "/dashboard/settings") return false;
    return (
      url.searchParams.get("message") === "Branch created successfully." ||
      url.searchParams.get("error") === "Only the business owner/admin can manage branches."
    );
  }, { timeout: 20_000 });

  const resultUrl = new URL(page.url());
  const outcome = resultUrl.searchParams.get("message") === "Branch created successfully."
    ? "success"
    : "auth-retry";

  if (outcome === "auth-retry" && !_retried) {
    await page.goto("/auth/login", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Sign in to your workspace" })).toBeVisible();
    const email = process.env.E2E_OWNER_EMAIL;
    const password = process.env.E2E_OWNER_PASSWORD;
    if (!email || !password) throw new Error("Owner E2E credentials are required for branch auth retry.");
    await page.locator('input[name="login_email"]').fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL((url) => url.pathname.startsWith("/dashboard"), { timeout: 20_000 });
    return createBranchFromUi(page, branchName, { address, phone, _retried: true });
  }

  if (outcome !== "success") throw new Error("Branch creation authorization failed after a fresh owner login.");
  await dismissDashboardResultModal(page, "Branch created successfully.");
}

async function refreshOwnerSession(page) {
  await page.goto("/auth/login", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Sign in to your workspace" })).toBeVisible();
  const email = process.env.E2E_OWNER_EMAIL;
  const password = process.env.E2E_OWNER_PASSWORD;
  if (!email || !password) throw new Error("Owner E2E credentials are required for service auth recovery.");
  await page.locator('input[name="login_email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => url.pathname.startsWith("/dashboard"), { timeout: 20_000 });
}

async function openBranchServicePicker(page, branchId, serviceName) {
  const target = `/dashboard/settings?view=branch-services&branch=${branchId}`;
  const option = () => page.locator('form.settings-service-picker select[name="service_key"] option').filter({ hasText: serviceName });

  // Hosted CI can occasionally render the next Settings request before the
  // just-created catalog row is visible through the authenticated server context.
  // Re-render once, then refresh the owner session once. This stays scoped to
  // the exact newly-created service instead of adding a broad test retry.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto(target, { waitUntil: "domcontentloaded" });
    await expectNoAppError(page);
    const assignForm = page.locator("form.settings-service-picker");
    await expect(assignForm).toBeVisible();
    if (await option().count()) return assignForm;
    if (attempt === 1) await refreshOwnerSession(page);
    else await page.waitForTimeout(750);
  }
  throw new Error(`New catalog service did not become available for branch assignment: ${serviceName}`);
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

  for (let assignmentAttempt = 0; assignmentAttempt < 2; assignmentAttempt += 1) {
    const assignForm = await openBranchServicePicker(page, branchId, serviceName);
    await assignForm.locator('select[name="service_key"]').selectOption({ label: serviceName });
    await assignForm.getByRole("button", { name: "Add to branch", exact: true }).click();
    await page.waitForURL((url) => {
      if (url.pathname !== "/dashboard/settings" || url.searchParams.get("view") !== "branch-services") return false;
      return url.searchParams.get("message") === "Service added to this branch." || url.searchParams.get("error") === "Service was not found in the library.";
    }, { timeout: 20_000 });

    const result = new URL(page.url());
    if (result.searchParams.get("message") === "Service added to this branch.") {
      await dismissDashboardResultModal(page, "Service added to this branch.");
      return;
    }
    if (assignmentAttempt === 0) {
      await dismissDashboardResultModal(page, "Service was not found in the library.");
      await refreshOwnerSession(page);
      continue;
    }
  }
  throw new Error(`Service assignment failed after refreshing the owner session: ${serviceName}`);
}

export async function expectNotice(page, text) {
  await expect(page.locator("body")).toContainText(text, { timeout: 15_000 });
  await expectNoAppError(page);
}
