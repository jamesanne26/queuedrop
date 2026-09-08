import { test, expect } from "@playwright/test";
import { loginAsOwner } from "../helpers/auth.mjs";
import { hasAdminTestEnvironment, ownerCredentials } from "../helpers/env.mjs";
import {
  cleanupOwnedBranch,
  createAdminClient,
  findBranchByName,
  findServiceByName,
  findTerminalByName,
  getCustomerSessionForTicket,
  getOwnerBusiness,
  getTicketById,
  latestTicketForService,
} from "../helpers/admin-db.mjs";
import { createBranchFromUi, createServiceFromUi, expectNotice, scenarioId } from "../helpers/scenario-fixtures.mjs";
import { expectNoAppError } from "../helpers/ui.mjs";

const credentials = ownerCredentials();
const adminReady = hasAdminTestEnvironment();

async function prepareQueueWorkspace(page, admin, owner, id) {
  const branchName = `E2E Queue Branch ${id}`;
  const serviceName = `E2E Queue Service ${id}`;
  await cleanupOwnedBranch(admin, owner.businessId, branchName);
  await loginAsOwner(page, credentials);
  await createBranchFromUi(page, branchName);
  const branch = await findBranchByName(admin, owner.businessId, branchName);
  expect(branch).not.toBeNull();
  await createServiceFromUi(page, branch.id, serviceName, { queuePrefix: "QET", estimatedMinutes: 9 });
  const service = await findServiceByName(admin, branch.id, serviceName);
  expect(service).not.toBeNull();
  return { branchName, serviceName, branch, service };
}

async function waitForTicketStatus(admin, ticketId, status) {
  await expect.poll(async () => (await getTicketById(admin, ticketId))?.status, { timeout: 15_000 }).toBe(status);
}

async function issueTestStub(page, admin, branch, service) {
  await page.goto(`/dashboard/queues?branch=${branch.id}&service=${service.id}`, { waitUntil: "domcontentloaded" });
  await expectNoAppError(page);
  await page.getByRole("button", { name: /Get test stub/i }).click();
  await expect.poll(async () => Boolean(await latestTicketForService(admin, branch.id, service.id)), { timeout: 15_000 }).toBe(true);
  const ticket = await latestTicketForService(admin, branch.id, service.id);
  expect(ticket?.status).toBe("waiting");
  return ticket;
}

async function submitVerificationDialog(dialog, actionButtonName) {
  const codeLocator = dialog.locator(".live-confirm-code");
  await expect(codeLocator).toBeVisible();
  const code = (await codeLocator.textContent())?.trim();
  expect(code).toMatch(/^\d{4}$/);

  const input = dialog.locator('input[name="confirm_code"]');
  await input.fill(code);
  await expect(input).toHaveValue(code);

  const submitButton = dialog.getByRole("button", { name: actionButtonName, exact: true });
  await expect(submitButton).toBeEnabled();

  // The live queue reconciles from Supabase every few seconds. A reconciliation
  // can replace the submit button between Playwright's pointer-stability checks,
  // which made the otherwise-valid cancel scenario flaky with "detached from DOM".
  // requestSubmit() exercises the same browser form-submit path/server action but
  // does not depend on a pointer target staying mounted for several animation frames.
  await dialog.locator("form.live-confirm-form").evaluate((form) => form.requestSubmit());
}

test.describe("owner terminals and queue operations", () => {
  test.skip(!credentials || !adminReady, "Owner credentials and TEST Supabase admin variables are required.");

  test("Scenario 6 - terminal create, edit assignment, open kiosk, issue stub, protected exit, and remove", async ({ page }) => {
    const id = scenarioId("terminal");
    const branchName = `E2E Terminal Branch ${id}`;
    const serviceAName = `E2E Terminal Service A ${id}`;
    const serviceBName = `E2E Terminal Service B ${id}`;
    const terminalName = `E2E Terminal ${id}`;
    const terminalEditedName = `${terminalName} Edited`;
    const admin = createAdminClient();
    const owner = await getOwnerBusiness(admin, credentials.email);
    await cleanupOwnedBranch(admin, owner.businessId, branchName);

    try {
      await loginAsOwner(page, credentials);
      await createBranchFromUi(page, branchName);
      const branch = await findBranchByName(admin, owner.businessId, branchName);
      expect(branch).not.toBeNull();
      await createServiceFromUi(page, branch.id, serviceAName, { queuePrefix: "TA" });
      await createServiceFromUi(page, branch.id, serviceBName, { queuePrefix: "TB" });
      const serviceA = await findServiceByName(admin, branch.id, serviceAName);
      const serviceB = await findServiceByName(admin, branch.id, serviceBName);
      expect(serviceA).not.toBeNull();
      expect(serviceB).not.toBeNull();

      await page.goto("/dashboard/terminals", { waitUntil: "domcontentloaded" });
      await expectNoAppError(page);

      // Configure a deterministic TEST-only kiosk exit PIN used by this scenario.
      const pinForm = page.locator("form.kiosk-pin-form");
      await pinForm.locator('input[name="kiosk_exit_pin"]').fill("4826");
      await pinForm.locator('input[name="kiosk_exit_pin_confirm"]').fill("4826");
      await pinForm.getByRole("button", { name: "Save PIN", exact: true }).click();
      await page.waitForURL(/\/dashboard\/terminals\?message=/, { timeout: 20_000 });
      await expectNotice(page, "Terminal exit PIN updated.");

      const createForm = page.locator("form.form-stack.compact-form").filter({ has: page.getByRole("button", { name: "Create terminal", exact: true }) }).first();
      await createForm.locator('input[name="name"]').fill(terminalName);
      await createForm.locator('select[name="branch_id"]').selectOption(branch.id);
      await createForm.locator('select[name="service_id"]').selectOption(serviceA.id);
      await createForm.getByRole("button", { name: "Create terminal", exact: true }).click();
      await page.waitForURL(/\/dashboard\/terminals\?message=/, { timeout: 20_000 });
      await expectNotice(page, "QueueDrop terminal created.");

      let terminal = await findTerminalByName(admin, branch.id, terminalName);
      expect(terminal).not.toBeNull();
      expect(terminal?.service_id).toBe(serviceA.id);

      let card = page.locator("article.terminal-card", { hasText: terminalName });
      await card.locator("summary").click();
      const editForm = card.locator("form.terminal-edit-form");
      await editForm.locator('input[name="name"]').fill(terminalEditedName);
      await editForm.locator('select[name="branch_id"]').selectOption(branch.id);
      await editForm.locator('select[name="service_id"]').selectOption(serviceB.id);
      await editForm.getByRole("button", { name: "Save assignment", exact: true }).click();
      await page.waitForURL(/\/dashboard\/terminals\?message=/, { timeout: 20_000 });
      await expectNotice(page, "Terminal branch and default service updated.");

      terminal = await findTerminalByName(admin, branch.id, terminalEditedName);
      expect(terminal).not.toBeNull();
      expect(terminal?.service_id).toBe(serviceB.id);

      card = page.locator("article.terminal-card", { hasText: terminalEditedName });
      await card.getByRole("link", { name: "Open Terminal", exact: true }).click();
      await page.waitForURL(/\/kiosk\//, { timeout: 20_000 });
      await expect(page.getByRole("button", { name: "Press here to get stub" })).toBeVisible();
      await expect(page.locator("body")).toContainText(serviceBName);
      await page.getByRole("button", { name: "Press here to get stub" }).click();
      await expect.poll(async () => Boolean(await latestTicketForService(admin, branch.id, serviceB.id)), { timeout: 15_000 }).toBe(true);

      await page.getByRole("button", { name: "← Back", exact: true }).click();
      const exitDialog = page.getByRole("dialog", { name: "Enter exit PIN" });
      await exitDialog.getByLabel("Exit PIN").fill("4826");
      await exitDialog.getByRole("button", { name: "Return to dashboard", exact: true }).click();
      await page.waitForURL((url) => url.pathname === "/dashboard", { timeout: 20_000 });
      await page.getByRole("link", { name: "Terminals", exact: true }).click();
      await page.waitForURL((url) => url.pathname === "/dashboard/terminals", { timeout: 20_000 });

      card = page.locator("article.terminal-card", { hasText: terminalEditedName });
      await card.getByRole("button", { name: "Remove", exact: true }).click();
      await page.waitForURL(/\/dashboard\/terminals\?message=/, { timeout: 20_000 });
      await expectNotice(page, "Terminal removed.");
      expect(await findTerminalByName(admin, branch.id, terminalEditedName)).toBeNull();
    } finally {
      await cleanupOwnedBranch(admin, owner.businessId, branchName);
    }
  });

  test("Scenario 7 - full queue happy path: waiting → pending → serving → complete → history", async ({ page }) => {
    const id = scenarioId("queue-happy");
    const admin = createAdminClient();
    const owner = await getOwnerBusiness(admin, credentials.email);
    let branchName = "";
    try {
      const setup = await prepareQueueWorkspace(page, admin, owner, id);
      branchName = setup.branchName;
      const ticket = await issueTestStub(page, admin, setup.branch, setup.service);
      await expect(page.locator(".live-waiting-panel")).toContainText(ticket.display_number);

      await page.getByRole("button", { name: "Call next", exact: true }).click();
      await waitForTicketStatus(admin, ticket.id, "called");
      await expect(page.locator(".live-pending-panel")).toContainText(ticket.display_number);

      const pendingCard = page.locator(".live-pending-row-v4", { hasText: ticket.display_number });
      await pendingCard.getByRole("button", { name: "Move to serving", exact: true }).click();
      await waitForTicketStatus(admin, ticket.id, "serving");
      await expect(page.locator(".live-serving-panel")).toContainText(ticket.display_number);

      const servingCard = page.locator(".live-serving-row-v4", { hasText: ticket.display_number });
      await servingCard.getByRole("button", { name: "Complete", exact: true }).click();
      await waitForTicketStatus(admin, ticket.id, "completed");
      const completed = await getTicketById(admin, ticket.id);
      expect(completed?.completed_at).not.toBeNull();

      // Wait for the completed action to finish updating the live queue before
      // opening History. Clicking History while the server-action refresh is still
      // settling can have its local history state overwritten by the refresh.
      await expect(page.locator(".live-serving-row-v4", { hasText: ticket.display_number })).toHaveCount(0, { timeout: 15_000 });
      await expect(page.locator(".live-serving-panel")).toContainText("No stub being served", { timeout: 15_000 });

      await page.getByRole("button", { name: "History", exact: true }).click();
      const historyPanel = page.locator(".live-history-panel");
      await expect(historyPanel.getByRole("heading", { name: "Recent stub history", exact: true })).toBeVisible({ timeout: 15_000 });
      const historyRow = historyPanel.locator("tbody tr", { hasText: ticket.display_number });
      await expect(historyRow).toBeVisible({ timeout: 15_000 });
      await expect(historyRow).toContainText("completed");
    } finally {
      if (branchName) await cleanupOwnedBranch(admin, owner.businessId, branchName);
    }
  });

  test("Scenario 8 - cancel a waiting stub with verification code", async ({ page }) => {
    const id = scenarioId("queue-cancel");
    const admin = createAdminClient();
    const owner = await getOwnerBusiness(admin, credentials.email);
    let branchName = "";
    try {
      const setup = await prepareQueueWorkspace(page, admin, owner, id);
      branchName = setup.branchName;
      const ticket = await issueTestStub(page, admin, setup.branch, setup.service);
      const waitingCard = page.locator(".live-waiting-panel .live-ticket-card", { hasText: ticket.display_number });
      await waitingCard.getByRole("button", { name: "Cancel", exact: true }).click();
      const dialog = page.getByRole("dialog");
      await submitVerificationDialog(dialog, "Cancel stub");
      await waitForTicketStatus(admin, ticket.id, "cancelled");
      expect((await getTicketById(admin, ticket.id))?.cancelled_at).not.toBeNull();
    } finally {
      if (branchName) await cleanupOwnedBranch(admin, owner.businessId, branchName);
    }
  });

  test("Scenario 9 - return serving stub to the end of waiting queue", async ({ page }) => {
    const id = scenarioId("queue-return");
    const admin = createAdminClient();
    const owner = await getOwnerBusiness(admin, credentials.email);
    let branchName = "";
    try {
      const setup = await prepareQueueWorkspace(page, admin, owner, id);
      branchName = setup.branchName;
      const first = await issueTestStub(page, admin, setup.branch, setup.service);
      await page.getByRole("button", { name: /Get test stub/i }).click();
      await expect.poll(async () => {
        const { count, error } = await admin.from("tickets").select("id", { count: "exact", head: true }).eq("branch_id", setup.branch.id).eq("service_id", setup.service.id).eq("status", "waiting");
        if (error) throw error;
        return count ?? 0;
      }, { timeout: 15_000 }).toBe(2);

      await page.getByRole("button", { name: "Call next", exact: true }).click();
      await waitForTicketStatus(admin, first.id, "called");
      const pendingCard = page.locator(".live-pending-row-v4", { hasText: first.display_number });
      await pendingCard.getByRole("button", { name: "Move to serving", exact: true }).click();
      await waitForTicketStatus(admin, first.id, "serving");

      const servingCard = page.locator(".live-serving-row-v4", { hasText: first.display_number });
      await servingCard.getByRole("button", { name: "Return to last", exact: true }).click();
      const dialog = page.getByRole("dialog");
      await submitVerificationDialog(dialog, "Return to last");
      await waitForTicketStatus(admin, first.id, "waiting");

      const waitingCards = page.locator(".live-waiting-panel .live-ticket-card");
      await expect(waitingCards).toHaveCount(2);
      await expect(waitingCards.nth(1)).toContainText(first.display_number);
    } finally {
      if (branchName) await cleanupOwnedBranch(admin, owner.businessId, branchName);
    }
  });

  test("Scenario 10 - customer status link renders and SMS number persists", async ({ page }) => {
    const id = scenarioId("customer-status");
    const admin = createAdminClient();
    const owner = await getOwnerBusiness(admin, credentials.email);
    let branchName = "";
    try {
      const setup = await prepareQueueWorkspace(page, admin, owner, id);
      branchName = setup.branchName;
      const ticket = await issueTestStub(page, admin, setup.branch, setup.service);
      const session = await getCustomerSessionForTicket(admin, ticket.id);
      expect(session?.session_token).toBeTruthy();

      await page.goto(`/q/status/${session.session_token}`, { waitUntil: "domcontentloaded" });
      await expect(page.locator("body")).toContainText(ticket.display_number);
      await expect(page.locator("body")).toContainText(setup.serviceName);
      await expect(page.locator("body")).toContainText(setup.branchName);
      const smsForm = page.locator("form.compact-form");
      await smsForm.locator('input[name="phone"]').fill("09171234567");
      await smsForm.getByRole("button", { name: "Enable SMS alerts", exact: true }).click();
      await page.waitForURL(/\?message=/, { timeout: 20_000 });
      await expect(page.locator("body")).toContainText("SMS alerts enabled for this stub.");
      expect((await getTicketById(admin, ticket.id))?.sms_phone).toBe("639171234567");
    } finally {
      if (branchName) await cleanupOwnedBranch(admin, owner.businessId, branchName);
    }
  });
});
