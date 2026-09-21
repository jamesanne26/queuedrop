import { test, expect } from "@playwright/test";
import { loginAsOwner } from "../helpers/auth.mjs";
import { ownerCredentials } from "../helpers/env.mjs";
import { expectResponsivePage, responsiveViewports } from "../helpers/responsive.mjs";

const credentials = ownerCredentials();
const publicSweepTimeout = process.env.CI ? 60_000 : 45_000;
const ownerSweepTimeout = process.env.CI ? 120_000 : 60_000;

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
  "/dashboard/queues",
  "/dashboard/tv",
  "/dashboard/reports",
  "/dashboard/settings?view=branch-general",
  "/dashboard/settings?view=branch-services",
  "/dashboard/settings?view=branch-users",
  "/dashboard/settings?view=branch-operating",
  "/dashboard/settings?view=branch-queue",
  "/dashboard/settings?view=branch-notifications",
  "/dashboard/settings?view=branch-appearance",
  "/dashboard/settings?view=branch-terminals",
  "/dashboard/settings?view=services",
  "/dashboard/settings?view=users",
  "/dashboard/settings?view=roles",
  "/dashboard/settings?view=permissions",
  "/dashboard/settings?view=business",
  "/dashboard/settings?view=billing",
];

test.describe("responsive layout coverage", () => {
  for (const viewport of responsiveViewports) {
    test(`public views fit ${viewport.name} (${viewport.width}x${viewport.height})`, async ({ page }) => {
      test.setTimeout(publicSweepTimeout);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const pageErrors = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));

      for (const route of publicRoutes) {
        await test.step(`${viewport.name} public ${route}`, async () => {
          const response = await page.goto(route, { waitUntil: "domcontentloaded" });
          expect(response, `No response received for ${route}`).not.toBeNull();
          expect(response.status(), `${route} returned HTTP ${response.status()}`).toBeLessThan(400);
          await expectResponsivePage(page, `${route} at ${viewport.name}`);
        });
      }

      expect(pageErrors, `Uncaught browser errors in ${viewport.name} public sweep`).toEqual([]);
    });

    test(`owner views fit ${viewport.name} (${viewport.width}x${viewport.height})`, async ({ page }) => {
      test.setTimeout(ownerSweepTimeout);
      test.skip(!credentials, "E2E_OWNER_EMAIL and E2E_OWNER_PASSWORD are required.");
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const pageErrors = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));

      await loginAsOwner(page, credentials);
      for (const route of ownerRoutes) {
        await test.step(`${viewport.name} owner ${route}`, async () => {
          const response = await page.goto(route, { waitUntil: "domcontentloaded" });
          expect(response, `No response received for ${route}`).not.toBeNull();
          expect(response.status(), `${route} returned HTTP ${response.status()}`).toBeLessThan(400);
          await expect(page.locator("body")).not.toContainText(/Invalid login credentials/i);
          await expectResponsivePage(page, `${route} at ${viewport.name}`);
        });
      }

      expect(pageErrors, `Uncaught browser errors in ${viewport.name} owner sweep`).toEqual([]);
    });
  }
});
