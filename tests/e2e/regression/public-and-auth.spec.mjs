import { test, expect } from "@playwright/test";

const publicRoutes = ["/", "/auth/login", "/pricing"];

test("health endpoint reports QueueDrop web healthy", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"] ?? "").toContain("application/json");

  const body = await response.json();
  expect(body?.status).toBe("ok");
  expect(body?.service).toBe("queuedrop-web");
});

for (const route of publicRoutes) {
  test(`public route ${route} renders without server error`, async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    const response = await page.goto(route, { waitUntil: "domcontentloaded" });
    expect(response, `No response received for ${route}`).not.toBeNull();
    expect(response.status(), `${route} returned HTTP ${response.status()}`).toBeLessThan(400);
    await expect(page.locator("body")).not.toContainText(/Internal Server Error|Application error/i);
    expect(pageErrors, `Uncaught browser errors while rendering ${route}`).toEqual([]);
  });
}

test("unauthenticated dashboard access redirects to login", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await page.waitForURL(/\/auth\/login/);
  await expect(page.getByRole("heading", { name: "Sign in to your workspace" })).toBeVisible();
  expect(pageErrors, "Uncaught browser errors during dashboard auth redirect").toEqual([]);
});
