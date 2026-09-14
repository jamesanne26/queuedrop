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


const teamForms = await readFile(new URL("../../app/dashboard/team/team-forms.tsx", import.meta.url), "utf8");
const teamActions = await readFile(new URL("../../app/dashboard/team/actions.ts", import.meta.url), "utf8");

test("team creation requires email for every role", () => {
  assert.match(teamForms, /Email <em>required<\/em>/);
  assert.match(teamForms, /name="email"[\s\S]*?required/);
  assert.doesNotMatch(teamForms, /Email\{?[^\n]*optional/);
});

test("team server actions reject missing email and no longer create phone-only auth identities", () => {
  const requiredEmailGuards = teamActions.match(/Email is required for every QueueDrop user\./g) ?? [];
  assert.equal(requiredEmailGuards.length, 2);
  assert.doesNotMatch(teamActions, /phoneLoginEmail/);
  assert.doesNotMatch(teamActions, /login_method:\s*email\s*\?/);
  assert.match(teamActions, /login_method:\s*"email"/);
});
