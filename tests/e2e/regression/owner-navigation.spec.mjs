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
    ["Queue", "/dashboard/queues"],
    ["History", "/dashboard/reports"],
    ["TV Display", "/dashboard/tv"],
    ["Settings", "/dashboard/settings"],
  ];

  for (const [label, path] of destinations) {
    test(`owner can open ${label}`, async ({ page }) => {
      await openDashboardDestination(page, label, path);
    });
  }

  const settingsDestinations = [
    ["General", "branch-general"],
    ["Branch Services", "branch-services"],
    ["Branch Users", "branch-users"],
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
    await page.goto("/dashboard/settings?view=branch-general", { waitUntil: "domcontentloaded" });
    await expectNoAppError(page);

    const branchGroup = page.locator('[data-settings-group="branches"]');
    if ((await branchGroup.getAttribute("aria-expanded")) !== "true") await branchGroup.click();

    const branchButtons = page.locator('[data-branch-id]');
    const count = await branchButtons.count();
    test.skip(count < 2, "At least two branches are required for the branch-switching regression check.");

    const target = branchButtons.nth(1);
    const targetId = await target.getAttribute("data-branch-id");
    const targetName = (await target.locator("strong").textContent())?.trim();
    expect(targetId).toBeTruthy();
    expect(targetName).toBeTruthy();

    await target.click();
    await expect(page).toHaveURL(new RegExp(`branch=${targetId}`));
    await expect(page.locator(".settings-branch-hero h2")).toHaveText(targetName);
    await expect(page.locator('form.settings-general-form-v3 input[name="branch_id"]')).toHaveValue(targetId);
    await expect(page.locator('form.settings-general-form-v3 input[name="name"]')).toHaveValue(targetName);
    await expectNoAppError(page);
  });

  test("owner can sign out", async ({ page }) => {
    await signOut(page);
    await expect(page.getByRole("link", { name: "QueueDrop" }).first()).toBeVisible();
  });
});
