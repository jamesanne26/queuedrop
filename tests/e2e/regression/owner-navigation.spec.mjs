import { test, expect } from "@playwright/test";
import { loginAsOwner, signOut } from "../helpers/auth.mjs";
import { ownerCredentials } from "../helpers/env.mjs";
import { openDashboardDestination } from "../helpers/ui.mjs";

const credentials = ownerCredentials();

test.describe("owner dashboard navigation", () => {
  test.skip(!credentials, "E2E_OWNER_EMAIL and E2E_OWNER_PASSWORD are required.");

  test.beforeEach(async ({ page }) => {
    await loginAsOwner(page, credentials);
  });

  const destinations = [
    ["Branches", "/dashboard/branches"],
    ["Services", "/dashboard/services"],
    ["Team", "/dashboard/team"],
    ["History & Reports", "/dashboard/reports"],
    ["Terminals", "/dashboard/terminals"],
    ["Queues", "/dashboard/queues"],
    ["Settings", "/dashboard/settings"],
  ];

  for (const [label, path] of destinations) {
    test(`owner can open ${label}`, async ({ page }) => {
      await openDashboardDestination(page, label, path);
    });
  }

  test("owner can sign out", async ({ page }) => {
    await signOut(page);
    await expect(page.getByRole("link", { name: "QueueDrop" }).first()).toBeVisible();
  });
});
