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

export async function openDashboardDestination(page, label, path, loadedSelector = "h1") {
  const link = page.getByRole("link", { name: label, exact: true });
  await expect(link).toBeVisible();
  await link.click();
  await page.waitForURL((url) => url.pathname === path, { timeout: 15_000 });
  await expect(page.locator(loadedSelector).first()).toBeVisible();
  await expectNoAppError(page);
}

// Retry only an explicitly observed transient gateway failure on a safe GET.
// Never turn a successful HTTP response with missing UI into a silent retry:
// that must remain a real application regression.
export async function gotoDashboardPage(page, path) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    let response;
    try {
      response = await page.goto(path, { waitUntil: "domcontentloaded", timeout: 30_000 });
    } catch (error) {
      // Only a timed-out, safe GET navigation is retried, never mutations.
      if (!/Timeout.*exceeded|TimeoutError/.test(String(error)) || attempt === 3) {
        throw new Error(`TEST GET ${path} navigation failed on attempt ${attempt}: ${error.message}`);
      }
      await page.waitForTimeout(attempt * 1000);
      continue;
    }
    const status = response?.status();
    if (status === 502 || status === 503 || status === 504) {
      if (attempt === 3) throw new Error(`TEST GET ${path} returned HTTP ${status} after 3 attempts`);
      await page.waitForTimeout(attempt * 1000);
      continue;
    }
    if (status && status >= 400) throw new Error(`TEST GET ${path} returned HTTP ${status}`);
    if (new URL(page.url()).pathname !== new URL(path, "https://test.invalid").pathname) {
      throw new Error(`TEST GET ${path} redirected unexpectedly to ${page.url()}`);
    }
    await expectNoAppError(page);
    return;
  }
}
