import { expect } from "@playwright/test";

export async function loginAsOwner(page, credentials, { expectedDestination = "dashboard" } = {}) {
  if (!["dashboard", "system"].includes(expectedDestination)) throw new Error("Unsupported E2E login destination");
  // Cloudflare TEST occasionally returns a transient 503 under the full-suite
  // load. Retry only that transport failure; never retry bad credentials or
  // silently accept a broken application page.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await page.goto("/auth/login", { waitUntil: "domcontentloaded" });
    if (response?.status() !== 503) break;
    if (attempt === 2) throw new Error("TEST login endpoint returned HTTP 503 on three attempts");
    await page.waitForTimeout(1000 * (attempt + 1));
  }
  await expect(page.getByRole("heading", { name: "Sign in to your workspace" })).toBeVisible();

  const loginInput = page.locator('input[name="login_email"]');
  const passwordInput = page.locator('input[name="password"]');
  const signInButton = page.getByRole("button", { name: "Sign in", exact: true });

  await expect(loginInput).toBeVisible();
  await expect(passwordInput).toBeVisible();
  await loginInput.fill(credentials.email);
  await passwordInput.fill(credentials.password);

  // Observe the login POST as well as the redirect. A transient Cloudflare
  // gateway failure can leave the browser on /auth/login with no error query.
  // Retrying a known 503 is safe; never retry an ambiguous submission or
  // invalid credentials (which could conceal an actual auth regression).
  const loginResponsePromise = page.waitForResponse(
    (response) => response.request().method() === "POST" &&
      (response.url().includes("/auth/login") || response.url().includes("/auth/sign-in")),
    { timeout: 20_000 },
  ).catch(() => null);
  await signInButton.click();
  const destination = (url) => {
    if (expectedDestination === "system" && url.pathname === "/system") return true;
    if (expectedDestination === "dashboard" && (url.pathname === "/system" || url.pathname === "/dashboard")) return true;
    return url.pathname === "/auth/login" && url.searchParams.has("error");
  };
  try {
    await page.waitForURL(destination, { timeout: 20_000, waitUntil: "domcontentloaded" });
  } catch (error) {
    const loginResponse = await loginResponsePromise;
    throw new Error(
      `Owner login did not reach ${expectedDestination}; current URL=${page.url()}, ` +
      `login POST status=${loginResponse?.status() ?? "not observed"}. ` +
      `This is an auth/Cloudflare response failure, not a dashboard assertion. ${error.message}`,
    );
  }

  const loginResult = new URL(page.url());
  if (loginResult.pathname === "/auth/login" && loginResult.searchParams.has("error")) {
    throw new Error(
      "Owner E2E login failed. Verify E2E_OWNER_EMAIL and E2E_OWNER_PASSWORD belong to the configured TEST Supabase project.",
    );
  }

  // Platform owners land on /system even when they also own a TEST business.
  // Dashboard scenarios must navigate explicitly to their business workspace.
  if (expectedDestination === "dashboard" && loginResult.pathname === "/system") {
    const dashboardResponse = await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    if (dashboardResponse && dashboardResponse.status() >= 400) {
      throw new Error(`Dashboard navigation returned HTTP ${dashboardResponse.status()}`);
    }
    if (new URL(page.url()).pathname !== "/dashboard") {
      throw new Error(`Dashboard login landed on unexpected path: ${new URL(page.url()).pathname}`);
    }
  }

  // The Account/Sign out controls now live inside a collapsible sidebar menu and
  // the whole sidebar is off-canvas on phone/tablet until navigation is opened.
  // Use the authenticated dashboard shell itself as the viewport-independent
  // login-ready signal instead of requiring a currently visible Sign out button.
  if (expectedDestination === "dashboard") {
    await expect(page.locator("aside.sidebar")).toBeAttached();
    await expect(page.locator("aside.sidebar .sidebar-account-menu")).toBeAttached();
  }
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
