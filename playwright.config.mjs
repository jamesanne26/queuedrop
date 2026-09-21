import { defineConfig } from "@playwright/test";
import { loadPlaywrightEnvironment, usableTestBaseUrl } from "./tests/e2e/helpers/load-test-env.mjs";

const loadedEnvFiles = loadPlaywrightEnvironment();
if (loadedEnvFiles.length && !process.env.CI) {
  console.log(`[QueueDrop E2E] Loaded environment: ${loadedEnvFiles.join(", ")}`);
}

const externalBaseUrl = usableTestBaseUrl(process.env.QUEUEDROP_TEST_BASE_URL);
const baseURL = externalBaseUrl || "http://127.0.0.1:3000";

// Local E2E defaults to a production-like Next.js server. This avoids dev/HMR
// stream-abort noise (for example: "The destination stream closed early") and
// makes the browser suite closer to what users actually receive after deploy.
// Set QUEUEDROP_E2E_SERVER_MODE=dev only when intentionally debugging with HMR.
const requestedServerMode = process.env.QUEUEDROP_E2E_SERVER_MODE?.trim().toLowerCase();
const localServerMode = requestedServerMode === "dev" ? "dev" : "production";
const localServerCommand =
  localServerMode === "dev"
    ? "npm run dev -- --hostname 127.0.0.1 --port 3000"
    : "npm run build && npm run start -- --hostname 127.0.0.1 --port 3000";

if (!externalBaseUrl && !process.env.CI) {
  console.log(`[QueueDrop E2E] Local server mode: ${localServerMode}`);
}

export default defineConfig({
  testDir: "./tests/e2e/regression",
  globalSetup: "./tests/e2e/global-setup.mjs",
  fullyParallel: false,
  workers: 1,
  // Stop cascading shared-fixture failures before they consume the entire CI job.
  maxFailures: process.env.CI ? 3 : 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },

  // Keep one CI retry so a failure still produces retry diagnostics, but never
  // allow a retry-only pass to make the workflow look healthy. A flaky test is
  // an engineering signal and must keep Browser E2E red until it is fixed.
  retries: process.env.CI ? 1 : 0,
  retryStrategy: process.env.CI ? "isolated" : "immediate",
  failOnFlakyTests: Boolean(process.env.CI),
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI
    ? [["line"], ["html", { outputFolder: "playwright-report", open: "never" }]]
    : [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    baseURL,
    browserName: "chromium",
    actionTimeout: 12_000,
    navigationTimeout: 20_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  outputDir: "test-results/playwright",
  webServer: externalBaseUrl
    ? undefined
    : {
        command: localServerCommand,
        url: `${baseURL}/api/health`,
        reuseExistingServer: false,
        timeout: 180_000,
      },
});
