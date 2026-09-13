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
    ["Queues", "/dashboard/queues"],
    ["History & Reports", "/dashboard/reports"],
    ["TV Queue Display", "/dashboard/tv"],
    ["Settings", "/dashboard/settings"],
  ];

  for (const [label, path] of destinations) {
    test(`owner can open ${label}`, async ({ page }) => {
      await openDashboardDestination(page, label, path);
    });
  }

  const settingsDestinations = [
    ["Branches", "/dashboard/branches"],
    ["Services", "/dashboard/services"],
    ["Users & Access", "/dashboard/team"],
    ["Branch terminals", "/dashboard/terminals"],
  ];

  for (const [label, path] of settingsDestinations) {
    test(`owner can open ${label} from Settings`, async ({ page }) => {
      await page.goto("/dashboard/settings", { waitUntil: "domcontentloaded" });
      await expectNoAppError(page);
      const link = page.getByRole("link", { name: label, exact: true }).first();
      await expect(link).toBeVisible();
      await link.click();
      await page.waitForURL((url) => url.pathname === path, { timeout: 15_000 });
      await expectNoAppError(page);
    });
  }

  test("owner can sign out", async ({ page }) => {
    await signOut(page);
    await expect(page.getByRole("link", { name: "QueueDrop" }).first()).toBeVisible();
  });
});
