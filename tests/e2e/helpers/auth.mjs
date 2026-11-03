import { expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { reuseOwnerAuthState, ownerAuthStatePath } from "./auth-state.mjs";

export async function loginAsOwner(page, credentials, { freshSession = false } = {}) {
  if (reuseOwnerAuthState && !freshSession) {
    const saved = JSON.parse(await readFile(ownerAuthStatePath, "utf8"));
    await page.context().addCookies(saved.cookies);
    const response = await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    if (!response || response.status() >= 400) {
      throw new Error(`Cloudflare TEST owner session failed: HTTP ${response?.status() ?? "no response"}`);
    }
    await expect(page).toHaveURL(/\/dashboard(?:\/|$)/);
    await expect(page.locator("aside.sidebar")).toBeAttached();
    await expect(page.locator("aside.sidebar .sidebar-account-menu")).toBeAttached();
    return;
  }

  const loginResponse = await page.goto("/auth/login", { waitUntil: "domcontentloaded" });
  if (!loginResponse || loginResponse.status() >= 400) {
    throw new Error(`Cloudflare TEST sign-in page failed: HTTP ${loginResponse?.status() ?? "no response"}`);
  }
  await expect(page.getByRole("heading", { name: "Sign in to your workspace" })).toBeVisible();

  const loginInput = page.locator('input[name="login_email"]');
  const passwordInput = page.locator('input[name="password"]');
  const signInButton = page.getByRole("button", { name: "Sign in", exact: true });

  await expect(loginInput).toBeVisible();
  await expect(passwordInput).toBeVisible();
  await loginInput.fill(credentials.email);
  await passwordInput.fill(credentials.password);

  // Register the navigation observer before submitting: hosted auth redirects
  // can complete before a post-click waitForURL starts observing.
  await Promise.all([
    page.waitForURL((url) => {
      if (url.pathname === "/dashboard" || url.pathname.startsWith("/dashboard/")) return true;
      return url.pathname === "/auth/login" && url.searchParams.has("error");
    }, { timeout: 30_000, waitUntil: "domcontentloaded" }),
    signInButton.click(),
  ]);

  const loginResult = new URL(page.url());
  if (loginResult.pathname === "/auth/login" && loginResult.searchParams.has("error")) {
    throw new Error(
      "Owner E2E login failed. Verify E2E_OWNER_EMAIL and E2E_OWNER_PASSWORD belong to the configured TEST Supabase project.",
    );
  }

  // The Account/Sign out controls now live inside a collapsible sidebar menu and
  // the whole sidebar is off-canvas on phone/tablet until navigation is opened.
  // Use the authenticated dashboard shell itself as the viewport-independent
  // login-ready signal instead of requiring a currently visible Sign out button.
  await expect(page.locator("aside.sidebar")).toBeAttached();
  await expect(page.locator("aside.sidebar .sidebar-account-menu")).toBeAttached();
  await expect(page.locator("body")).not.toContainText(/Invalid login credentials|Internal Server Error|Application error/i);
}

export async function signOut(page) {
  const account = page.locator("summary.sidebar-account-trigger");

  // On responsive layouts the sidebar is off-canvas until the hamburger opens it.
  if (!(await account.isVisible())) {
    const openNavigation = page.getByRole("button", { name: "Open navigation menu" });
    await expect(openNavigation).toBeVisible();
    await openNavigation.click();
    await expect(account).toBeVisible();
  }

  const menu = page.locator("details.sidebar-account-menu");
  if (!(await menu.evaluate((element) => element.hasAttribute("open")))) {
    await account.click();
  }

  const button = page.getByRole("button", { name: "Sign out", exact: true });
  await expect(button).toBeVisible();
  await button.click();
  await page.waitForURL(/\/$/, { timeout: 15_000 });
}
