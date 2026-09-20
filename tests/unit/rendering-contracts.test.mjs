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

test("global loading and settings review dialogs render through document body portals", async () => {
  const globalLoader = await readFile(new URL("../../app/_components/global-submit-loading.tsx", import.meta.url), "utf8");
  const settingsGuard = await readFile(new URL("../../app/dashboard/settings/settings-save-guard.tsx", import.meta.url), "utf8");
  assert.match(globalLoader, /createPortal\(/);
  assert.match(globalLoader, /document\.body/);
  assert.match(settingsGuard, /qd-settings-review-backdrop/);
  assert.match(settingsGuard, /createPortal\(/);
});

test("new team users receive branch assignment controls and create-user loading is enabled", async () => {
  const fields = await readFile(new URL("../../app/dashboard/team/team-forms.tsx", import.meta.url), "utf8");
  const workspace = await readFile(new URL("../../app/dashboard/team/team-workspace.tsx", import.meta.url), "utf8");
  assert.match(fields, /name="branch_ids"/);
  assert.match(fields, /Assigned branch/);
  assert.doesNotMatch(workspace, /team-add-user-popup-form[^>]*data-no-global-loading/);
});

test("staff terminal shortcut is permission based and account supports password changes", async () => {
  const queue = await readFile(new URL("../../app/dashboard/queues/live-queue-workspace.tsx", import.meta.url), "utf8");
  const account = await readFile(new URL("../../app/dashboard/account/page.tsx", import.meta.url), "utf8");
  assert.match(queue, /canManageTerminals \? <a/);
  assert.match(account, /name="new_password"/);
  assert.match(account, /name="confirm_password"/);
});

test("branch duplication preserves catalog assignments and excludes users and terminals", async () => {
  const source = await readFile(new URL("../../app/dashboard/branches/actions.ts", import.meta.url), "utf8");
  assert.match(source, /branch_service_catalog/);
  assert.match(source, /sourceLinksResult/);
  assert.doesNotMatch(source, /branch_users.*sourceBranchId/);
});

test("owner and admin appearance editor can apply changes to all branches", async () => {
  const form = await readFile(new URL("../../app/dashboard/settings/terminal-appearance-form.tsx", import.meta.url), "utf8");
  const actions = await readFile(new URL("../../app/dashboard/settings/actions.ts", import.meta.url), "utf8");
  assert.match(form, /apply_to_all_branches/);
  assert.match(actions, /applyToAll/);
});

test("queue controls and mutations are permission driven", async () => {
  const page = await readFile(new URL("../../app/dashboard/queues/page.tsx", import.meta.url), "utf8");
  const workspace = await readFile(new URL("../../app/dashboard/queues/live-queue-workspace.tsx", import.meta.url), "utf8");
  const actions = await readFile(new URL("../../app/dashboard/queues/actions.ts", import.meta.url), "utf8");
  assert.match(page, /can_return_customer/);
  assert.match(workspace, /queuePermissions\.call/);
  assert.match(workspace, /queuePermissions\.returnLast/);
  assert.match(actions, /requireQueuePermission/);
  assert.match(actions, /qd_staff_update_ticket_status/);
});

test("settings routes reject views outside the signed-in user's permissions", async () => {
  const page = await readFile(new URL("../../app/dashboard/settings/page.tsx", import.meta.url), "utf8");
  assert.match(page, /const viewAllowed/);
  assert.match(page, /if \(!viewAllowed\) redirect\("\/dashboard"\)/);
});

test("settings navigation waits for server data before showing a new view", async () => {
  const consoleSource = await readFile(new URL("../../app/dashboard/settings/settings-unified-console.tsx", import.meta.url), "utf8");
  assert.match(consoleSource, /const \[isViewSwitching, startViewTransition\] = useTransition\(\)/);
  assert.doesNotMatch(consoleSource, /const chooseView[\s\S]*?setView\(next\)/);
  assert.match(consoleSource, /startViewTransition\(\(\) => router\.replace\(nextUrl/);
  assert.match(consoleSource, /startBranchTransition\(\(\) => router\.replace\(nextUrl/);
  assert.match(consoleSource, /aria-current=\{selected \? "page" : undefined\}/);
  assert.doesNotMatch(consoleSource, /router\.prefetch\(getBranchUrl\(branch\.id\)\)/);
});

test("queue test-stub creation blocks call-next until the stub action settles", async () => {
  const workspace = await readFile(new URL("../../app/dashboard/queues/live-queue-workspace.tsx", import.meta.url), "utf8");
  assert.match(workspace, /disabled=\{!selectedService \|\| stubBusy\}>Call next/);
  assert.match(workspace, /type="button" onClick=\{showHistory\}/);
});

test("appearance preview uses the selected branch and assigned service", async () => {
  const form = await readFile(new URL("../../app/dashboard/settings/terminal-appearance-form.tsx", import.meta.url), "utf8");
  const page = await readFile(new URL("../../app/dashboard/settings/page.tsx", import.meta.url), "utf8");
  assert.match(form, /<h3>\{branchName\}<\/h3>/);
  assert.match(form, /\{previewServiceName\}/);
  assert.doesNotMatch(form, />Commonwealth</);
  assert.doesNotMatch(form, />Haircut/);
  assert.match(page, /"branch-appearance"/);
  assert.match(page, /previewServiceName=\{previewServiceName\}/);
});

test("manage settings is honored by both settings routes and server actions", async () => {
  const page = await readFile(new URL("../../app/dashboard/settings/page.tsx", import.meta.url), "utf8");
  const actions = await readFile(new URL("../../app/dashboard/settings/actions.ts", import.meta.url), "utf8");
  assert.match(page, /can_manage_branches, can_manage_settings/);
  assert.match(page, /const canManageSettings = businessWide \|\| Boolean\(membership\.can_manage_settings\)/);
  assert.match(actions, /can_manage_settings,can_manage_operating_hours/);
  assert.match(actions, /privileged \|\| Boolean\(settingsMembership\?\.can_manage_settings\)/);
});

test("history-only users can open history without receiving report summaries", async () => {
  const reports = await readFile(new URL("../../app/dashboard/reports/page.tsx", import.meta.url), "utf8");
  assert.match(reports, /can_view_history, can_view_reports/);
  assert.match(reports, /if \(!canViewReports\) q = q\.in\("status", \["completed", "cancelled", "no_show"\]\)/);
  assert.match(reports, /\{canViewReports \? <div className="reports-stat-grid">/);
});

test("atomic onboarding avoids a redundant membership round trip", async () => {
  const onboarding = await readFile(new URL("../../app/onboarding/actions.ts", import.meta.url), "utf8");
  assert.doesNotMatch(onboarding, /existingMembership/);
  assert.match(onboarding, /create_initial_business_workspace/);
});

test("service catalog preserves the saved service group in the edit form", async () => {
  const catalog = await readFile(new URL("../../app/dashboard/settings/service-catalog.tsx", import.meta.url), "utf8");
  assert.match(catalog, /name="service_group"[\s\S]*?defaultValue=\{service\.group \?\? ""\}/);
});

test("live queue uses one realtime owner and avoids route-wide refreshes for inline stubs", async () => {
  const page = await readFile(new URL("../../app/dashboard/queues/page.tsx", import.meta.url), "utf8");
  const workspace = await readFile(new URL("../../app/dashboard/queues/live-queue-workspace.tsx", import.meta.url), "utf8");
  const actions = await readFile(new URL("../../app/dashboard/queues/actions.ts", import.meta.url), "utf8");
  assert.doesNotMatch(page, /LiveQueueRefresh/);
  assert.match(workspace, /realtimeConnected \? "Live connected" : "Reconnecting…"/);
  const inlineAction = actions.slice(actions.indexOf("export async function simulateGetStubInlineAction"), actions.indexOf("export async function callNextAction"));
  assert.doesNotMatch(inlineAction, /revalidatePath/);
});

test("settings only loads member profiles for user-assignment views", async () => {
  const page = await readFile(new URL("../../app/dashboard/settings/page.tsx", import.meta.url), "utf8");
  assert.match(page, /const needsMembers = \["users", "branch-users"\]/);
  assert.match(page, /needsMembers \? memberQuery/);
});
