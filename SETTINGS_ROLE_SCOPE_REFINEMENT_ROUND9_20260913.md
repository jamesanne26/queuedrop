# Settings / Role Scope refinement – 2026-09-13

- Add User no longer asks for a branch. Branch assignment is managed only from Branch Users.
- All-branches roles may be assigned to multiple branches; selected/own-branch roles may be assigned to at most one.
- Branch Users filters out single-branch users already assigned elsewhere.
- Branch Users displays the declared/custom role, not the internal base role.
- Automatic SMS checkbox moved to the right of its label.
- Select padding normalized.
- Settings save bar is no longer sticky, avoiding clipped review UI.
- Save Role & Permissions moved beside Create Custom Role for editable roles.
- New migration: 20260913211500_role_branch_scope_assignment_rules.sql.
