import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workflow = readFileSync(
  new URL("../../.github/workflows/cloudflare-browser-e2e.yml", import.meta.url),
  "utf8",
);

test("Cloudflare browser workflow is restricted to TEST", () => {
  assert.match(workflow, /branches: \[test\]/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/test'/);
  assert.match(workflow, /environment: test/);
  assert.match(workflow, /SMS_DRY_RUN: "true"/);
  assert.doesNotMatch(workflow, /branches: \[main\]|environment: prod|sylvegfbkxgjfctbjfec/);
});

test("exact TEST revision is verified before any fixture credentials are created", () => {
  const verify = workflow.indexOf("node scripts/verify-cloudflare-test-revision.mjs");
  const credentials = workflow.indexOf("password=\"$(openssl rand -hex 24)\"");
  const fixture = workflow.indexOf("tests/e2e/global-setup.mjs");
  assert.ok(verify >= 0 && credentials > verify && fixture > credentials);
});

test("ephemeral password is masked before GitHub Actions exports it", () => {
  const mask = workflow.indexOf("::add-mask::%s");
  const exportPassword = workflow.indexOf("E2E_OWNER_PASSWORD=%s");
  assert.ok(mask >= 0 && exportPassword > mask);
  assert.match(workflow, /GITHUB_RUN_ID/);
  assert.match(workflow, /GITHUB_RUN_ATTEMPT/);
});

test("browser release gate rejects missing results and any skipped test", () => {
  assert.match(workflow, /test -s test-results\/results\.json/);
  assert.match(workflow, /QUEUEDROP_FAIL_ON_E2E_SKIP: "1"/);
  assert.match(workflow, /node scripts\/report-e2e-skips\.mjs test-results\/results\.json/);
});
