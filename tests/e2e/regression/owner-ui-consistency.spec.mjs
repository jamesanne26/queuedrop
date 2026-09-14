import { test, expect } from "@playwright/test";
import { loginAsOwner } from "../helpers/auth.mjs";
import { ownerCredentials } from "../helpers/env.mjs";
import { expectNoAppError } from "../helpers/ui.mjs";

const credentials = ownerCredentials();

test.describe("owner UI consistency contracts", () => {
  test.skip(!credentials, "E2E_OWNER_EMAIL and E2E_OWNER_PASSWORD are required.");

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsOwner(page, credentials);
  });

  test("desktop sidebar stays compact", async ({ page }) => {
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    const sidebar = page.locator(".dashboard-shell > .sidebar");
    await expect(sidebar).toBeVisible();
    const box = await sidebar.boundingBox();
    expect(box).not.toBeNull();
    expect(box.width).toBeGreaterThanOrEqual(185);
    expect(box.width).toBeLessThanOrEqual(220);
    await expectNoAppError(page);
  });

  test("role toolbar actions use the same dimensions", async ({ page }) => {
    await page.goto("/dashboard/settings?view=roles", { waitUntil: "domcontentloaded" });
    await expectNoAppError(page);
    const save = page.getByRole("button", { name: "Save Role & Permissions", exact: true });
    const create = page.getByRole("button", { name: "+ Create Custom Role", exact: true });
    if (!(await save.isVisible().catch(() => false))) test.skip(true, "Selected role is protected; save action is intentionally hidden.");
    const [saveBox, createBox] = await Promise.all([save.boundingBox(), create.boundingBox()]);
    expect(saveBox).not.toBeNull();
    expect(createBox).not.toBeNull();
    expect(Math.abs(saveBox.width - createBox.width)).toBeLessThanOrEqual(2);
    expect(Math.abs(saveBox.height - createBox.height)).toBeLessThanOrEqual(2);
  });

  test("branch save and delete actions are equal-sized and visually grouped", async ({ page }) => {
    await page.goto("/dashboard/settings?view=branch-general", { waitUntil: "domcontentloaded" });
    await expectNoAppError(page);
    const save = page.getByRole("button", { name: "Save Changes", exact: true });
    const del = page.getByRole("button", { name: "Delete branch", exact: true });
    await expect(save).toBeVisible();
    if (!(await del.isVisible().catch(() => false))) test.skip(true, "Delete branch is not available to this account.");
    const [saveBox, deleteBox] = await Promise.all([save.boundingBox(), del.boundingBox()]);
    expect(saveBox).not.toBeNull();
    expect(deleteBox).not.toBeNull();
    expect(Math.abs(saveBox.width - deleteBox.width)).toBeLessThanOrEqual(2);
    expect(Math.abs(saveBox.height - deleteBox.height)).toBeLessThanOrEqual(2);
    const verticalGap = deleteBox.y - (saveBox.y + saveBox.height);
    expect(verticalGap).toBeGreaterThanOrEqual(0);
    expect(verticalGap).toBeLessThanOrEqual(28);
  });
});
