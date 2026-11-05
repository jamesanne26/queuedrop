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
import { assertDedicatedTestProject } from "../helpers/subscription-fixture.mjs";
import { expectNoAppError } from "../helpers/ui.mjs";

const credentials = ownerCredentials();
const adminReady = hasAdminTestEnvironment();
const testOnlyContact = "+15555550123";

test("system owner contact setting reaches homepage and customer queue page", async ({ page }) => {
  test.skip(!credentials || !adminReady, "Owner credentials and TEST Supabase admin variables are required.");
  assertDedicatedTestProject(process.env.QUEUEDROP_TEST_SUPABASE_URL);
  test.setTimeout(150_000);

  const admin = createAdminClient();
  const owner = await getOwnerBusiness(admin, credentials.email);
  const id = scenarioId("platform-contact");
  const branchName = `E2E Contact Branch ${id}`;
  let contactSnapshotLoaded = false;
  let previousContact = null;
  let previousSystemOwner = null;
  let systemOwnerSnapshotLoaded = false;

  // The same dedicated TEST owner is temporarily granted platform-owner access.
  // Snapshot and restore it even on test failure. Never touch a PROD project.
  const { data: existingSystemOwner, error: systemOwnerReadError } = await admin
    .from("system_owners").select("is_active").eq("user_id", owner.userId).maybeSingle();
  if (systemOwnerReadError) throw systemOwnerReadError;
  previousSystemOwner = existingSystemOwner;
  systemOwnerSnapshotLoaded = true;
  const { error: grantError } = await admin.from("system_owners")
    .upsert({ user_id: owner.userId, is_active: true }, { onConflict: "user_id" });
  if (grantError) throw grantError;

  try {
    await loginAsOwner(page, credentials, { expectedDestination: "system" });
    await page.goto("/system/settings", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/system\/settings$/, { timeout: 15_000 });

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
    const homepageContact = page.getByRole("link", { name: /Contact QueueDrop/ });
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
    try {
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
    } finally {
      await cleanupOwnedBranch(admin, owner.businessId, branchName);
    }
  }
  } finally {
    if (systemOwnerSnapshotLoaded) {
      if (previousSystemOwner) {
        const { error } = await admin.from("system_owners")
          .update({ is_active: previousSystemOwner.is_active }).eq("user_id", owner.userId);
        if (error) throw error;
      } else {
        const { error } = await admin.from("system_owners").delete().eq("user_id", owner.userId);
        if (error) throw error;
      }
    }
  }
});
