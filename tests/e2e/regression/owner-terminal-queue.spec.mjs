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
import { expectResponsivePage, responsiveViewports } from "../helpers/responsive.mjs";

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

  const getStubButton = page.getByRole("button", { name: /Get test stub/i });
  await getStubButton.click();

  // Get test stub is intentionally inline/realtime-first now: the queue updates
  // without a redirect or success query parameter. Synchronize on persistence,
  // the visible success banner, and the button returning from its busy state.
  // The browser success banner is the first authoritative completion signal.
  // After that, allow the service-role verification read extra time on hosted CI.
  await expect(page.getByText(/Test stub .* issued|Test stub issued/i).first()).toBeVisible({ timeout: 20_000 });
  await expect.poll(async () => Boolean(await latestTicketForService(admin, branch.id, service.id)), { timeout: 30_000 }).toBe(true);
  await expect(page.getByRole("button", { name: /Get test stub/i })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: /Get test stub/i })).toBeEnabled({ timeout: 20_000 });

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
    // This full terminal lifecycle intentionally crosses several server actions and
    // a kiosk route; keep strict assertions but allow realistic hosted-CI latency.
    test.setTimeout(90_000);
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
      await pinForm.locator('select[name="branch_id"]').selectOption(branch.id);
      await pinForm.locator('input[name="kiosk_exit_pin"]').fill("4826");
      await pinForm.locator('input[name="kiosk_exit_pin_confirm"]').fill("4826");
      await pinForm.getByRole("button", { name: "Save PIN", exact: true }).click();
      await page.waitForURL((url) => url.pathname === "/dashboard/settings" && url.searchParams.get("view") === "branch-terminals" && url.searchParams.get("branch") === branch.id && url.searchParams.get("message") === "Branch terminal exit PIN updated.", { timeout: 20_000 });
      await expectNotice(page, "Branch terminal exit PIN updated.");
      await page.goto("/dashboard/terminals", { waitUntil: "domcontentloaded" });
      await expectNoAppError(page);

      const createForm = page.locator("form.form-stack.compact-form").filter({ has: page.getByRole("button", { name: "Create terminal", exact: true }) }).first();
      await createForm.locator('input[name="name"]').fill(terminalName);
      await createForm.locator('select[name="branch_id"]').selectOption(branch.id);
      await createForm.locator('select[name="service_id"]').selectOption(serviceA.id);
      await createForm.getByRole("button", { name: "Create terminal", exact: true }).click();
      await page.waitForURL((url) => url.pathname === "/dashboard/settings" && url.searchParams.get("view") === "branch-terminals" && Boolean(url.searchParams.get("message")), { timeout: 20_000 });
      await expectNotice(page, "QueueDrop terminal created.");

      let terminal = await findTerminalByName(admin, branch.id, terminalName);
      expect(terminal).not.toBeNull();
      expect(terminal?.service_id).toBe(serviceA.id);

      // Server actions redirect terminal mutations to the Settings terminal panel.
      // Re-open the canonical /dashboard/terminals page before interacting with the
      // registered-terminal card so this lifecycle test uses that page's real DOM.
      await page.goto("/dashboard/terminals", { waitUntil: "domcontentloaded" });
      await expectNoAppError(page);
      let card = page.locator("article.terminal-card", { hasText: terminalName });
      await expect(card).toBeVisible({ timeout: 20_000 });
      await card.getByText("Branch & default service", { exact: true }).click();
      const editForm = card.locator("form.terminal-edit-form");
      await editForm.locator('input[name="name"]').fill(terminalEditedName);
      await editForm.locator('select[name="branch_id"]').selectOption(branch.id);
      await editForm.locator('select[name="service_id"]').selectOption(serviceB.id);
      await editForm.getByRole("button", { name: "Save assignment", exact: true }).click();
      await page.waitForURL((url) => url.pathname === "/dashboard/settings" && url.searchParams.get("view") === "branch-terminals" && Boolean(url.searchParams.get("message")), { timeout: 20_000 });
      await expectNotice(page, "Terminal branch and default service updated.");

      terminal = await findTerminalByName(admin, branch.id, terminalEditedName);
      expect(terminal).not.toBeNull();
      expect(terminal?.service_id).toBe(serviceB.id);

      await page.goto("/dashboard/terminals", { waitUntil: "domcontentloaded" });
      await expectNoAppError(page);
      card = page.locator("article.terminal-card", { hasText: terminalEditedName });
      await expect(card).toBeVisible({ timeout: 20_000 });
      await card.getByRole("link", { name: "Open Terminal", exact: true }).click();
      await page.waitForURL(/\/kiosk\//, { timeout: 20_000 });
      await expect(page.getByRole("button", { name: "Press here to get stub" })).toBeVisible();
      await expect(page.locator("body")).toContainText(serviceBName);

      // Kiosk/terminal mode is commonly used on tablets, but it must also remain
      // usable on a phone-sized fallback screen and on desktop hardware.
      for (const viewport of responsiveViewports) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await expect(page.getByRole("button", { name: "Press here to get stub" })).toBeVisible();
        await expectResponsivePage(page, `kiosk at ${viewport.name}`);
      }

      await page.setViewportSize({ width: 1440, height: 900 });
      await page.getByRole("button", { name: "Press here to get stub" }).click();
      await expect.poll(async () => Boolean(await latestTicketForService(admin, branch.id, serviceB.id)), { timeout: 15_000 }).toBe(true);

      await page.getByRole("button", { name: "← Back", exact: true }).click();
      const exitDialog = page.getByRole("dialog", { name: "Enter exit PIN" });
      await exitDialog.getByLabel("Exit PIN").fill("4826");

      // Exercise the protected-exit flow through the UI and assert the outcome the
      // operator actually cares about. Waiting for the fetch response event itself is
      // brittle here because Next.js can start client navigation immediately after the
      // successful response and Playwright may never observe that transient event.
      await exitDialog.getByRole("button", { name: "Return to dashboard", exact: true }).click();
      await expect(page).toHaveURL(/\/dashboard(?:\?|$)/, { timeout: 30_000 });
      await expect(page.getByText(/Unable to exit kiosk mode|Incorrect PIN|Dashboard session expired/i)).toHaveCount(0);

      // Open a fresh authenticated terminals document before the removal assertions.
      await page.goto("/dashboard/terminals", { waitUntil: "domcontentloaded" });
      await expectNoAppError(page);

      card = page.locator("article.terminal-card", { hasText: terminalEditedName });
      await expect(card).toBeVisible({ timeout: 20_000 });
      await card.getByRole("button", { name: "Remove", exact: true }).click();

      // Deletion is a Next.js server action. In hosted CI the database commit can
      // complete before the redirect/RSC response stream finishes, so waiting on
      // the query-string redirect made this otherwise-successful scenario flaky.
      // Verify the durable side effect first, then render a fresh terminals page
      // and assert the deleted terminal is gone from the UI. This tests the actual
      // removal without coupling correctness to transient navigation timing.
      await expect.poll(
        async () => await findTerminalByName(admin, branch.id, terminalEditedName),
        { timeout: 20_000 },
      ).toBeNull();
      await page.goto("/dashboard/terminals", { waitUntil: "domcontentloaded" });
      await expectNoAppError(page);
      await expect(page.locator("article.terminal-card", { hasText: terminalEditedName })).toHaveCount(0);
    } finally {
      await cleanupOwnedBranch(admin, owner.businessId, branchName);
    }
  });

  test("Scenario 7 - full queue happy path: waiting → pending → serving → complete → history", async ({ page }) => {
    test.setTimeout(90_000);
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

      // The queue mutations above are Next.js server actions. In production-mode E2E,
      // the final RSC refresh can still own the response stream for a short period
      // after the database has committed. Start the history assertion from a fresh,
      // fully-settled document so this test verifies persisted state instead of racing
      // an earlier server-action stream. This is deterministic synchronization, not a
      // sleep/retry workaround.
      await expect(page.locator(".live-serving-row-v4", { hasText: ticket.display_number })).toHaveCount(0, { timeout: 15_000 });
      await expect(page.locator(".live-serving-panel")).toContainText("No stub being served", { timeout: 15_000 });
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.locator(".live-queue-page")).toBeVisible({ timeout: 15_000 });

      const historyButton = page.getByRole("button", { name: "History", exact: true });
      await expect(historyButton).toBeEnabled({ timeout: 15_000 });
      await historyButton.click();
      const historyPanel = page.locator(".live-history-panel");
      await expect(historyPanel.getByRole("heading", { name: "Recent stub history", exact: true })).toBeVisible({ timeout: 30_000 });
      const historyRow = historyPanel.locator("tbody tr", { hasText: ticket.display_number });
      await expect(historyRow).toBeVisible({ timeout: 30_000 });
      await expect(historyRow).toContainText("completed");
      await expect(page).not.toHaveURL(/[?&]error=No(?:\+|%20)waiting(?:\+|%20)stub/);
    } finally {
      if (branchName) await cleanupOwnedBranch(admin, owner.businessId, branchName);
    }
  });

  test("Scenario 8 - cancel a waiting stub with verification code", async ({ page }) => {
    test.setTimeout(90_000);
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
    // This path issues two stubs and crosses several server actions; 45s is too
    // tight in production-mode E2E even when every durable mutation succeeds.
    test.setTimeout(90_000);
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

      const returned = await getTicketById(admin, first.id);
      const { data: waitingRows, error: waitingError } = await admin.from("tickets")
        .select("id,ticket_number")
        .eq("branch_id", setup.branch.id)
        .eq("service_id", setup.service.id)
        .eq("status", "waiting")
        .order("ticket_number", { ascending: true });
      if (waitingError) throw waitingError;
      expect(waitingRows).toHaveLength(2);
      expect(waitingRows.at(-1)?.id).toBe(first.id);
      expect(returned?.ticket_number).toBe(waitingRows.at(-1)?.ticket_number);

      // Render from persisted state so the assertion is not coupled to websocket
      // delivery timing after the return-to-last server action.
      await page.reload({ waitUntil: "domcontentloaded" });
      const waitingCards = page.locator(".live-waiting-panel .live-ticket-card");
      await expect(waitingCards).toHaveCount(2, { timeout: 15_000 });
      await expect(waitingCards.nth(1)).toContainText(first.display_number);
    } finally {
      if (branchName) await cleanupOwnedBranch(admin, owner.businessId, branchName);
    }
  });

  test("Scenario 10 - customer status link renders and SMS number persists", async ({ page }) => {
    // This scenario deliberately reloads the customer experience across phone,
    // tablet and desktop widths, including an iframe route. Keep those assertions
    // instead of racing the suite-wide 45s timeout.
    test.setTimeout(120_000);
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

      // The live queue opens the real customer status route in a same-origin iframe.
      // This catches security-header regressions such as X-Frame-Options: DENY or
      // CSP frame-ancestors 'none', which otherwise render a blank phone preview.
      for (const viewport of responsiveViewports) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        const ticketButton = page.getByRole("button", { name: ticket.display_number, exact: true });
        await expect(ticketButton).toBeVisible();
        await ticketButton.click();
        const previewDialog = page.getByRole("dialog", { name: `Customer view for ${ticket.display_number}` });
        await expect(previewDialog).toBeVisible();
        const previewFrame = previewDialog.frameLocator(`iframe[title="Customer status ${ticket.display_number}"]`);
        await expect(previewFrame.locator("body")).toContainText(ticket.display_number, { timeout: 15_000 });
        await expect(previewFrame.locator("body")).toContainText(setup.serviceName);
        await expectResponsivePage(page, `customer preview modal at ${viewport.name}`);
        await previewDialog.getByRole("button", { name: "Close", exact: true }).click();
        await expect(previewDialog).toBeHidden();
      }

      await page.goto(`/q/status/${session.session_token}`, { waitUntil: "domcontentloaded" });
      await expect(page.locator("body")).toContainText(ticket.display_number);
      await expect(page.locator("body")).toContainText(setup.serviceName);
      await expect(page.locator("body")).toContainText(setup.branchName);

      // Guard the QR/customer page at representative phone, tablet, and desktop widths.
      for (const viewport of responsiveViewports) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await expect(page.locator(".customer-ticket-hero")).toBeVisible();
        await expect(page.locator(".customer-queue-list-card")).toBeVisible();
        await expectResponsivePage(page, `customer QR/status page at ${viewport.name}`);

        if (viewport.width <= 390) {
          const country = page.getByLabel("Country code");
          const mobile = page.getByLabel("Mobile number");
          await expect(country).toBeVisible();
          await expect(mobile).toBeVisible();
          await expect(country.locator("option").first()).toContainText(/\+\d+/);
          const [countryBox, mobileBox] = await Promise.all([country.boundingBox(), mobile.boundingBox()]);
          expect(countryBox).not.toBeNull();
          expect(mobileBox).not.toBeNull();
          expect(Math.abs(countryBox.y - mobileBox.y)).toBeLessThanOrEqual(4);
          expect(countryBox.width).toBeLessThan(mobileBox.width);
        }
      }

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
