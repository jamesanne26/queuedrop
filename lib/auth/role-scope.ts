export type RoleBranchScope = "own_branch_only" | "selected_branches" | "all_branches";

export function effectiveRoleBranchScope(
  declaredScope: RoleBranchScope | null | undefined,
  baseRole: string | null | undefined,
): RoleBranchScope {
  if (declaredScope === "own_branch_only" || declaredScope === "selected_branches" || declaredScope === "all_branches") {
    return declaredScope;
  }
  return baseRole === "staff" ? "own_branch_only" : "all_branches";
}

export function maxBranchesForRole(scope: RoleBranchScope): number {
  return scope === "all_branches" ? Number.POSITIVE_INFINITY : 1;
}

export function canAssignRoleToAnotherBranch(scope: RoleBranchScope, currentAssignmentCount: number): boolean {
  if (scope === "all_branches") return true;
  return Math.max(0, currentAssignmentCount) === 0;
}

export function normalizeRequestedBranchIds(scope: RoleBranchScope, branchIds: readonly string[]): string[] {
  const unique = [...new Set(branchIds.filter(Boolean))];
  return scope === "all_branches" ? unique : unique.slice(0, 1);
}
