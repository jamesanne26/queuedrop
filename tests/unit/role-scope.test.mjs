import test from "node:test";
import assert from "node:assert/strict";
import {
  canAssignRoleToAnotherBranch,
  effectiveRoleBranchScope,
  maxBranchesForRole,
  normalizeRequestedBranchIds,
} from "../../lib/auth/role-scope.ts";

test("declared branch scope wins over base-role fallback", () => {
  assert.equal(effectiveRoleBranchScope("selected_branches", "staff"), "selected_branches");
  assert.equal(effectiveRoleBranchScope("all_branches", "staff"), "all_branches");
});

test("legacy staff defaults to one branch and non-staff defaults to all branches", () => {
  assert.equal(effectiveRoleBranchScope(null, "staff"), "own_branch_only");
  assert.equal(effectiveRoleBranchScope(undefined, "manager"), "all_branches");
});

test("single-branch role can only be added while it has no assignment", () => {
  assert.equal(canAssignRoleToAnotherBranch("own_branch_only", 0), true);
  assert.equal(canAssignRoleToAnotherBranch("own_branch_only", 1), false);
  assert.equal(canAssignRoleToAnotherBranch("selected_branches", 2), false);
});

test("all-branches role remains eligible for additional branches", () => {
  assert.equal(canAssignRoleToAnotherBranch("all_branches", 0), true);
  assert.equal(canAssignRoleToAnotherBranch("all_branches", 1000), true);
});

test("normalizes branch assignments by role scope", () => {
  assert.deepEqual(normalizeRequestedBranchIds("all_branches", ["a", "b", "a"]), ["a", "b"]);
  assert.deepEqual(normalizeRequestedBranchIds("selected_branches", ["a", "b"]), ["a"]);
  assert.deepEqual(normalizeRequestedBranchIds("own_branch_only", ["b", "a"]), ["b"]);
});

test("branch limits describe the assignment invariant", () => {
  assert.equal(maxBranchesForRole("own_branch_only"), 1);
  assert.equal(maxBranchesForRole("selected_branches"), 1);
  assert.equal(maxBranchesForRole("all_branches"), Number.POSITIVE_INFINITY);
});
