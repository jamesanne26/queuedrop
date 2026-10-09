import { test, expect } from "@playwright/test";
import { loginAsOwner } from "../helpers/auth.mjs";
import { hasAdminTestEnvironment, ownerCredentials } from "../helpers/env.mjs";
import {
  cleanupOwnedBranch,
  createAdminClient,
  findBranchByName,
  findServiceByName,
  getCustomerSessionForTicket,
  getOwnerBusiness,
  latestTicketForService,
} from "../helpers/admin-db.mjs";
import { createBranchFromUi, createServiceFromUi, scenarioId } from "../helpers/scenario-fixtures.mjs";
import { expectNoAppError } from "../helpers/ui.mjs";

const credentials = ownerCredentials();
const adminReady = hasAdminTestEnvironment();
const testOnlyContact = "+15555550123";

test("system owner contact setting reaches homepage and customer queue page", async ({ page }, testInfo) => {
  test.skip(!credentials || !adminReady, "Owner credentials and TEST Supabase admin variables are required.");
  const baseUrl = testInfo.project.use.baseURL;
  test.skip(!baseUrl || !new URL(baseUrl).hostname.includes("queuedrop-test"), "This contact-setting test only runs against the QueueDrop TEST deployment.");
  test.setTimeout(150_000);

  const admin = createAdminClient();
  const owner = await getOwnerBusiness(admin, credentials.email);
  const id = scenarioId("platform-contact");
  const branchName = `E2E Contact Branch ${id}`;
  let contactSnapshotLoaded = false;
  let previousContact = null;

  await loginAsOwner(page, credentials);
  await page.goto("/system/settings", { waitUntil: "domcontentloaded" });
  if (new URL(page.url()).pathname !== "/system/settings") {
    test.skip(true, "Configured E2E owner does not have platform-owner access in TEST.");
  }

  const { data: existingContact, error: contactReadError } = await admin
    .from("platform_public_contact")
    .select("id,phone")
    .eq("id", true)
    .maybeSingle();
  if (contactReadError) throw contactReadError;
  previousContact = existingContact ?? null;
  contactSnapshotLoaded = true;

  try {
    const phoneInput = page.getByLabel("Public contact number");
    await phoneInput.fill(testOnlyContact);
    await page.getByRole("button", { name: "Save public contact", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Public contact saved.", { timeout: 20_000 });
    await expect.poll(async () => {
      const { data, error } = await admin.from("platform_public_contact").select("phone").eq("id", true).maybeSingle();
      if (error) throw error;
      return data?.phone ?? null;
    }, { timeout: 15_000 }).toBe(testOnlyContact);

    await page.goto("/", { waitUntil: "domcontentloaded" });
    const homepageContact = page.getByRole("link", { name: new RegExp(`Contact QueueDrop.*${testOnlyContact.replace("+", "\\\\+")}`) });
    await expect(homepageContact).toHaveAttribute("href", `tel:${testOnlyContact}`);

    await cleanupOwnedBranch(admin, owner.businessId, branchName);
    await createBranchFromUi(page, branchName);
    const branch = await findBranchByName(admin, owner.businessId, branchName);
    expect(branch).not.toBeNull();
    const serviceName = `E2E Contact Service ${id}`;
    await createServiceFromUi(page, branch.id, serviceName, { queuePrefix: "CQR" });
    const service = await findServiceByName(admin, branch.id, serviceName);
    expect(service).not.toBeNull();

    await page.goto(`/dashboard/queues?branch=${branch.id}&service=${service.id}`, { waitUntil: "domcontentloaded" });
    await expectNoAppError(page);
    await page.getByRole("button", { name: /Get test stub/i }).click();
    await expect(page.getByText(/Test stub .* issued|Test stub issued/i).first()).toBeVisible({ timeout: 20_000 });
    await expect.poll(async () => Boolean(await latestTicketForService(admin, branch.id, service.id)), { timeout: 30_000 }).toBe(true);
    const ticket = await latestTicketForService(admin, branch.id, service.id);
    expect(ticket).not.toBeNull();
    const session = await getCustomerSessionForTicket(admin, ticket.id);
    expect(session?.session_token).toBeTruthy();

    await page.goto(`/q/status/${session.session_token}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".customer-platform-contact")).toContainText("Contact QueueDrop");
    await expect(page.getByRole("link", { name: testOnlyContact, exact: true })).toHaveAttribute("href", `tel:${testOnlyContact}`);
    await expect(page.getByRole("button", { name: "View your queue QR code", exact: true })).toBeVisible();
  } finally {
    if (contactSnapshotLoaded) {
      if (previousContact) {
        const { error } = await admin.from("platform_public_contact").upsert(
          { id: true, phone: previousContact.phone },
          { onConflict: "id" },
        );
        if (error) throw error;
      } else {
        const { error } = await admin.from("platform_public_contact").delete().eq("id", true);
        if (error) throw error;
      }
    }
    await cleanupOwnedBranch(admin, owner.businessId, branchName);
  }
});
