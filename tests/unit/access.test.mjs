import test from "node:test";
import assert from "node:assert/strict";
import { asBusinessRole, dashboardAccessFor, isOwnerOrAdmin } from "../../lib/auth/access.ts";

test("recognizes all supported business roles", () => {
  assert.equal(asBusinessRole("owner"), "owner");
  assert.equal(asBusinessRole("admin"), "admin");
  assert.equal(asBusinessRole("manager"), "manager");
  assert.equal(asBusinessRole("staff"), "staff");
});

test("rejects unknown roles", () => assert.equal(asBusinessRole("superuser"), null));
test("owner/admin helper only accepts privileged roles", () => {
  assert.equal(isOwnerOrAdmin("owner"), true);
  assert.equal(isOwnerOrAdmin("admin"), true);
  assert.equal(isOwnerOrAdmin("manager"), false);
  assert.equal(isOwnerOrAdmin(null), false);
});

test("unauthenticated membership has no dashboard access", () => {
  assert.deepEqual(dashboardAccessFor(null), {
    role: null, canViewQueue: false, canViewSettings: false, canViewReports: false, canManageTeam: false, canManageServices: false, canManageBranches: false,
  });
});

test("owner receives business-wide dashboard access", () => {
  const access = dashboardAccessFor({ role: "owner" });
  assert.equal(access.canViewSettings, true);
  assert.equal(access.canViewReports, true);
  assert.equal(access.canManageTeam, true);
  assert.equal(access.canManageServices, true);
  assert.equal(access.canManageBranches, true);
});

test("admin receives business-wide dashboard access", () => {
  assert.deepEqual(dashboardAccessFor({ role: "admin" }), { role: "admin", canViewQueue: true, canViewSettings: true, canViewReports: true, canManageTeam: true, canManageServices: true, canManageBranches: true });
});

test("manager access follows explicit permissions", () => {
  const access = dashboardAccessFor({ role: "manager", can_view_reports: true, can_manage_services: true, can_manage_kiosk_display: true });
  assert.equal(access.canViewReports, true);
  assert.equal(access.canManageServices, true);
  assert.equal(access.canManageBranches, true);
  assert.equal(access.canViewSettings, true);
  assert.equal(access.canManageTeam, false);
});

test("staff with no explicit permissions cannot access management areas", () => {
  const access = dashboardAccessFor({ role: "staff" });
  assert.equal(access.canViewSettings, false);
  assert.equal(access.canViewReports, false);
  assert.equal(access.canManageTeam, false);
  assert.equal(access.canManageServices, false);
  assert.equal(access.canManageBranches, false);
});
