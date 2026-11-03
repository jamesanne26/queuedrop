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
  const navigationErrors = [];
  const captureError = (error) => navigationErrors.push(String(error).slice(0, 500));
  page.on("pageerror", captureError);
  await link.click();
  await page.waitForURL((url) => url.pathname === path, { timeout: 15_000 });
  try {
    await expect(page.locator(loadedSelector).first()).toBeVisible({ timeout: 15_000 });
  } catch (error) {
    console.error("Dashboard navigation diagnostic:", JSON.stringify({
      path,
      url: page.url(),
      title: await page.title().catch(() => "unavailable"),
      bodyPreview: (await page.locator("body").innerText().catch(() => "")).slice(0, 900),
      errors: await page.locator("[role=alert]").allInnerTexts().catch(() => []),
      pageErrors: navigationErrors,
      tvResponse: path === "/dashboard/tv" ? await page.request.get(page.url()).then(async (r) => ({ status: r.status(), body: (await r.text()).slice(-3000) })).catch((e) => String(e)) : null,
    }));
    page.off("pageerror", captureError);
    throw error;
  }
  page.off("pageerror", captureError);
  await expectNoAppError(page);
}
