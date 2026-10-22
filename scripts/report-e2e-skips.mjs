// Prints every skipped Playwright case and reason; avoids silent release skips.
// Usage: node scripts/report-e2e-skips.mjs [path-to-results-json]
import { readFileSync } from "node:fs";
const path = process.argv[2] || "test-results/results.json";
const data = JSON.parse(readFileSync(path, "utf8"));
const skipped = [];
function walk(suites, ancestors = []) {
  for (const suite of suites || []) {
    const next = [...ancestors, suite.title].filter(Boolean);
    for (const spec of suite.specs || []) {
      for (const test of spec.tests || []) {
        if (test.status === "skipped" || (!test.results?.length && spec.ok === false)) {
          const annotations = (test.annotations || []).filter(a => a.type === "skip").map(a => a.description).filter(Boolean);
          skipped.push({ title: [...next, spec.title].join(" > "), reason: annotations.join("; ") || "no skip reason provided", file: suite.file || "" });
        }
      }
    }
    walk(suite.suites, next);
  }
}
walk(data.suites);
console.log("Playwright skipped cases:", skipped.length);
for (const [index, item] of skipped.entries()) console.log(`${index + 1}. ${item.title}\n   Reason: ${item.reason}\n   File: ${item.file}`);
// Only the platform-owner-only browser case may be skipped on the business-owner TEST account.
// Any new skipped scenario is a release regression, not a silently accepted pass.
const allowedReasons = new Set([
  "Configured E2E owner does not have platform-owner access in TEST.",
]);
const unexpected = skipped.filter(item => !allowedReasons.has(item.reason));
if (unexpected.length) {
  console.error("Unexpected Playwright skips:", unexpected.length);
  process.exitCode = 1;
}
if (process.env.QUEUEDROP_FAIL_ON_E2E_SKIP === "1" && skipped.length) process.exitCode = 1;

