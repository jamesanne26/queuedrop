import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const layout = await readFile(new URL("../../app/layout.tsx", import.meta.url), "utf8");
const loader = await readFile(new URL("../../app/_components/global-submit-loading.tsx", import.meta.url), "utf8");

test("root layout wraps search-param-aware global loader in Suspense", () => {
  assert.match(layout, /import\s*\{[^}]*Suspense[^}]*\}\s*from\s*["']react["']/);
  assert.match(layout, /<Suspense\s+fallback=\{null\}>\s*<GlobalSubmitLoading\s*\/>\s*<\/Suspense>/s);
});

test("global submit loader remains a client component before using navigation hooks", () => {
  assert.match(loader.trimStart(), /^"use client";/);
  assert.match(loader, /useSearchParams\(\)/);
});

test("root layout does not call useSearchParams directly", () => {
  assert.doesNotMatch(layout, /useSearchParams\s*\(/);
});
