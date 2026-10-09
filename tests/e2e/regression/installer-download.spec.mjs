import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { loginAsOwner } from "../helpers/auth.mjs";
import { ownerCredentials } from "../helpers/env.mjs";

const credentials = ownerCredentials();

test("Settings mobile installer button downloads the complete approved APK", async ({ page, request }, testInfo) => {
  test.skip(!credentials, "E2E_OWNER_EMAIL and E2E_OWNER_PASSWORD are required.");
  test.setTimeout(90_000);
  await loginAsOwner(page, credentials);
  await page.goto("/dashboard/settings?view=android-app");
  const link = page.getByRole("link", { name: "Download Mobile Installer", exact: true });
  await expect(link).toBeVisible();
  const href = await link.getAttribute("href");
  expect(href).toMatch(/^\/installers\/QueueDrop-(?:PrintBridge-v[\d.]+(?:-test)?|Recovery-TEST-v2\.0\.0)\.apk$/);
  const filename = href.split("/").at(-1);
  await expect(link).toHaveAttribute("download", filename);
  const isTest = new URL(testInfo.project.use.baseURL).hostname === "queuedrop-test.vercel.app";
  const manifestResponse = await request.get(href.replace(/\.apk$/, ".json"));
  expect(manifestResponse.status(), "Installer metadata must exist alongside the linked APK").toBe(200);
  const manifest = await manifestResponse.json();
  if (isTest) {
    expect(manifest.testOnly).toBe(true);
    expect(manifest.applicationId).toMatch(/^com\.getqueuedrop\.printbridge\.(?:test|next)$/);
  } else {
    expect(manifest.testOnly).not.toBe(true);
    expect(manifest.applicationId).toBe("com.getqueuedrop.printbridge");
  }
  const downloadPromise = page.waitForEvent("download");
  await link.click();
  const download = await downloadPromise;
  expect(await download.failure()).toBeNull();
  expect(download.suggestedFilename()).toBe(filename);
  const downloadedPath = await download.path();
  expect(downloadedPath).toBeTruthy();
  const bytes = await readFile(downloadedPath);
  expect(bytes.length, "Reject missing, partial or HTML error downloads").toBe(manifest.bytes);
  expect(bytes.subarray(0, 4).toString("hex")).toBe("504b0304");
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(manifest.sha256);
});
