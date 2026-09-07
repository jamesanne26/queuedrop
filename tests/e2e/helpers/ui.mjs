import { expect } from "@playwright/test";

export async function expectNoAppError(page) {
  await expect(page.locator("body")).not.toContainText(/Internal Server Error|Application error/i);
}

export async function dismissDashboardResultModal(page, expectedMessage) {
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  if (expectedMessage) {
    await expect(dialog).toContainText(expectedMessage);
  }
  await dialog.getByRole("button", { name: "OK", exact: true }).click();
  await expect(dialog).toBeHidden();
}

export async function openDashboardDestination(page, label, path) {
  const link = page.getByRole("link", { name: label, exact: true });
  await expect(link).toBeVisible();
  await link.click();
  await page.waitForURL((url) => url.pathname === path, { timeout: 15_000 });
  await expect(page.locator("h1").first()).toBeVisible();
  await expectNoAppError(page);
}
