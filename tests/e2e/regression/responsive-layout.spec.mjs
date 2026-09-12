import { test, expect } from "@playwright/test";
import { loginAsOwner } from "../helpers/auth.mjs";
import { ownerCredentials } from "../helpers/env.mjs";
import { expectResponsivePage, responsiveViewports } from "../helpers/responsive.mjs";

const credentials = ownerCredentials();

const publicRoutes = [
  "/",
  "/auth/login",
  "/auth/signup",
  "/auth/forgot-password",
  "/pricing",
  "/privacy",
  "/refunds",
  "/terms",
];

const ownerRoutes = [
  "/dashboard",
  "/dashboard/branches",
  "/dashboard/services",
  "/dashboard/team",
  "/dashboard/team?tab=roles",
  "/dashboard/reports",
  "/dashboard/terminals",
  "/dashboard/queues",
  "/dashboard/settings",
  "/client/configurations",
  "/client/subscription",
];

test.describe("responsive layout coverage", () => {
  for (const viewport of responsiveViewports) {
    test(`public views fit ${viewport.name} (${viewport.width}x${viewport.height})`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const pageErrors = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));

      for (const route of publicRoutes) {
        const response = await page.goto(route, { waitUntil: "domcontentloaded" });
        expect(response, `No response received for ${route}`).not.toBeNull();
        expect(response.status(), `${route} returned HTTP ${response.status()}`).toBeLessThan(400);
        await expectResponsivePage(page, `${route} at ${viewport.name}`);
      }

      expect(pageErrors, `Uncaught browser errors in ${viewport.name} public sweep`).toEqual([]);
    });

    test(`owner views fit ${viewport.name} (${viewport.width}x${viewport.height})`, async ({ page }) => {
      test.skip(!credentials, "E2E_OWNER_EMAIL and E2E_OWNER_PASSWORD are required.");
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const pageErrors = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));

      await loginAsOwner(page, credentials);
      for (const route of ownerRoutes) {
        await page.goto(route, { waitUntil: "domcontentloaded" });
        await expect(page.locator("body")).not.toContainText(/Invalid login credentials/i);
        await expectResponsivePage(page, `${route} at ${viewport.name}`);
      }

      expect(pageErrors, `Uncaught browser errors in ${viewport.name} owner sweep`).toEqual([]);
    });
  }
});
