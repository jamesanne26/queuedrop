import test from "node:test";
import assert from "node:assert/strict";
import {
  MANAGER_RECOMMENDED_PERMISSIONS,
  STAFF_RECOMMENDED_PERMISSIONS,
  recommendedBranchScopeForRole,
  recommendedPermissionsForRole,
} from "../../app/dashboard/team/role-presets.ts";

test("staff preset is least-privilege queue operations", () => {
  assert.equal(recommendedBranchScopeForRole("staff"), "own_branch_only");
  assert.ok(STAFF_RECOMMENDED_PERMISSIONS.includes("view_live_queue"));
  assert.ok(STAFF_RECOMMENDED_PERMISSIONS.includes("complete_customer"));
  assert.equal(STAFF_RECOMMENDED_PERMISSIONS.includes("manage_employees"), false);
  assert.equal(STAFF_RECOMMENDED_PERMISSIONS.includes("manage_settings"), false);
});

test("manager preset includes recommended operational management access", () => {
  assert.equal(recommendedBranchScopeForRole("manager"), "selected_branches");
  assert.ok(MANAGER_RECOMMENDED_PERMISSIONS.includes("manage_employees"));
  assert.ok(MANAGER_RECOMMENDED_PERMISSIONS.includes("manage_services"));
  assert.ok(MANAGER_RECOMMENDED_PERMISSIONS.includes("view_reports"));
  assert.equal(MANAGER_RECOMMENDED_PERMISSIONS.includes("manage_subscription"), false);
  assert.equal(MANAGER_RECOMMENDED_PERMISSIONS.includes("manage_roles"), false);
});

test("preset helper returns an editable copy", () => {
  const first = recommendedPermissionsForRole("manager");
  const second = recommendedPermissionsForRole("manager");
  first.pop();
  assert.notEqual(first.length, second.length);
});
