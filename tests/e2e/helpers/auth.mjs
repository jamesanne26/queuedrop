import { expect } from "@playwright/test";

export async function loginAsOwner(page, credentials) {
  await page.goto("/auth/login", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Sign in to your workspace" })).toBeVisible();

  const loginInput = page.locator('input[name="login_email"]');
  const passwordInput = page.locator('input[name="password"]');
  const signInButton = page.getByRole("button", { name: "Sign in", exact: true });

  await expect(loginInput).toBeVisible();
  await expect(passwordInput).toBeVisible();
  await loginInput.fill(credentials.email);
  await passwordInput.fill(credentials.password);

  await signInButton.click();
  await page.waitForURL(/\/dashboard(?:\?.*)?$/, { timeout: 20_000 });
  await expect(page.locator("h1").first()).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/Invalid login credentials|Internal Server Error|Application error/i);
}

export async function signOut(page) {
  const button = page.getByRole("button", { name: "Sign out", exact: true });
  await expect(button).toBeVisible();
  await button.click();
  await page.waitForURL(/\/$/, { timeout: 15_000 });
}
