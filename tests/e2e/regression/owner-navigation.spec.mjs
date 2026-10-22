import { test, expect } from "@playwright/test";
import { loginAsOwner, signOut } from "../helpers/auth.mjs";
import { ownerCredentials } from "../helpers/env.mjs";
import { expectNoAppError, openDashboardDestination } from "../helpers/ui.mjs";

const credentials = ownerCredentials();

test.describe("owner dashboard navigation", () => {
  test.skip(!credentials, "E2E_OWNER_EMAIL and E2E_OWNER_PASSWORD are required.");

  test.beforeEach(async ({ page }) => {
    await loginAsOwner(page, credentials);
  });

  const destinations = [
    ["Queue", "/dashboard/queues", "h1"],
    ["History", "/dashboard/reports", "h1"],
    // TV uses service names as h1 elements; a clean workspace can have no services yet.
    ["TV Display", "/dashboard/tv", ".tv-queue-page"],
    ["Settings", "/dashboard/settings", "h1"],
  ];

  for (const [label, path, loadedSelector] of destinations) {
    test(`owner can open ${label}`, async ({ page }) => {
      await openDashboardDestination(page, label, path, loadedSelector);
    });
  }

  const settingsDestinations = [
    ["General", "branch-general"],
    ["Branch Services", "branch-services"],
    ["Branch Users", "branch-users"],
    ["TV Display settings", "branch-tv"],
    ["Operating Hours", "branch-operating"],
    ["Queue Settings", "branch-queue"],
    ["Notifications", "branch-notifications"],
    ["Appearance", "branch-appearance"],
    ["Terminals", "branch-terminals"],
    ["Users", "users"],
    ["Roles", "roles"],
    ["Permissions", "permissions"],
    ["Business", "business"],
    ["Billing & Subscription", "billing"],
  ];

  for (const [label, view] of settingsDestinations) {
    test(`owner can open ${label} inside Settings`, async ({ page }) => {
      await page.goto("/dashboard/settings", { waitUntil: "domcontentloaded" });
      await expectNoAppError(page);
      let button = page.locator(`[data-settings-target="${view}"]`).first();
      if (!(await button.isVisible().catch(() => false))) {
        if (view.startsWith("branch-")) await page.locator('[data-settings-group="branches"]').click();
        if (["users", "roles", "permissions"].includes(view)) await page.locator('[data-settings-group="access"]').click();
        button = page.locator(`[data-settings-target="${view}"]`).first();
      }
      await expect(button).toBeVisible();
      await button.click();
      await expect(page).toHaveURL(new RegExp(`/dashboard/settings(?:\\?.*)?$`));
      await expect(page.locator("main.settings-unified-main")).toHaveAttribute("data-settings-view", view);
      if ((await button.getAttribute("role")) === "tab") await expect(button).toHaveAttribute("aria-selected", "true");
      else await expect(button).toHaveAttribute("aria-current", "page");
      await expectNoAppError(page);
    });
  }

  test("switching Settings branches refreshes branch-specific General data", async ({ page }) => {
    const { createAdminClient, getOwnerBusiness } = await import("../helpers/admin-db.mjs");
    const { hasAdminTestEnvironment } = await import("../helpers/env.mjs");
    test.skip(!hasAdminTestEnvironment(), "Dedicated TEST database access is required for isolated branch fixture.");
    const admin = createAdminClient();
    const owner = await getOwnerBusiness(admin, credentials.email);
    const id = crypto.randomUUID();
    const name = "E2E Branch Switch " + id.slice(0, 8);
    const { data: branch, error: insertError } = await admin.from("branches")
      .insert({ business_id: owner.businessId, name, slug: "e2e-switch-" + id, timezone: "Asia/Manila" })
      .select("id").single();
    if (insertError) throw insertError;
    try {
      const { error: assignmentError } = await admin.from("branch_users").insert({ branch_id: branch.id, user_id: owner.userId });
      if (assignmentError) throw assignmentError;
      await page.goto("/dashboard/settings?view=branch-general", { waitUntil: "domcontentloaded" });
      await expectNoAppError(page);
      const branchGroup = page.locator('[data-settings-group="branches"]');
      if ((await branchGroup.getAttribute("aria-expanded")) !== "true") await branchGroup.click();
      const target = page.locator('[data-branch-id="' + branch.id + '"]');
      await expect(target).toBeVisible();
      const current = page.locator('[data-branch-id][aria-current="page"]');
      if (await target.getAttribute("aria-current") === "page") {
        const other = page.locator('[data-branch-id]:not([aria-current="page"])').first();
        await expect(other).toBeVisible();
        await other.click();
      }
      await target.click();
      await expect(page).toHaveURL(new RegExp("branch=" + branch.id));
      await expect(page.locator(".settings-branch-hero h2")).toHaveText(name);
      await expect(page.locator('form.settings-general-form-v3 input[name="branch_id"]')).toHaveValue(branch.id);
      await expect(page.locator('form.settings-general-form-v3 input[name="name"]')).toHaveValue(name);
      await expectNoAppError(page);
    } finally {
      const { error } = await admin.from("branches").delete().eq("id", branch.id).eq("business_id", owner.businessId);
      if (error) throw error;
    }
  });

  test("owner can sign out", async ({ page }) => {
    await signOut(page);
    await expect(page.getByRole("link", { name: "QueueDrop" }).first()).toBeVisible();
  });

  for (const [field, invalid, error] of [
    ["Full name", "X", "Full name must be between 2 and 100 characters."],
    ["Mobile number", "123", "Mobile number must contain numbers only."],
  ]) {
    test(`account rejects invalid ${field} without persisting a profile change`, async ({ page }) => {
      await page.goto("/dashboard/account");
      const name = page.getByRole("textbox", { name: "Full name", exact: true });
      const phone = page.getByRole("textbox", { name: "Mobile number", exact: true });
      const before = { name: await name.inputValue(), phone: await phone.inputValue() };
      await page.getByRole("textbox", { name: field, exact: true }).fill(invalid);
      // Exercise server validation even when native minlength would stop submission.
      // This changes only the disposable Test browser form, never application settings.
      await page.getByRole("button", { name: "Save account & password", exact: true }).evaluate((button) => { button.form.noValidate = true; });
      await page.getByRole("button", { name: "Save account & password", exact: true }).click();
      await expect(page.getByText(error, { exact: true })).toBeVisible();
      await page.reload();
      await expect(name).toHaveValue(before.name);
      await expect(phone).toHaveValue(before.phone);
    });
  }
});

