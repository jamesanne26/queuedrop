import { expect } from "@playwright/test";

export async function expectNoAppError(page) {
  await expect(page.locator("body")).not.toContainText(/Internal Server Error|Application error/i);
}

export async function dismissDashboardResultModal(page, expectedMessage) {
  // Dashboard pages can already have another dialog open (for example the
  // Team member edit modal) when a server-action result arrives. Target the
  // dedicated result modal instead of the first generic role=dialog so the
  // helper cannot accidentally assert against the underlying editor.
  const dialog = page.locator(".qd-result-modal-backdrop").getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 25_000 });
  if (expectedMessage) {
    await expect(dialog).toContainText(expectedMessage, { timeout: 15_000 });
  }
  await dialog.getByRole("button", { name: "OK", exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
}

export async function openDashboardDestination(page, label, path) {
  const link = page.getByRole("link", { name: label, exact: true });
  await expect(link).toBeVisible();
  await link.click();
  await page.waitForURL((url) => url.pathname === path, { timeout: 15_000 });
  await expect(page.locator("h1").first()).toBeVisible();
  await expectNoAppError(page);
}
