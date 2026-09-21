"use client";

import { useMemo, useState } from "react";
import { createBusinessRole, deleteBusinessRole, updateBusinessRole } from "./actions";
import { ConfirmDeleteSubmit } from "@/app/dashboard/_components/confirm-delete-submit";
import styles from "./team-access.module.css";
import { recommendedBranchScopeForRole, recommendedPermissionsForRole, type RecommendedRolePreset } from "./role-presets";

type BusinessRole = {
  id: string;
  name: string;
  description: string | null;
  base_role: "owner" | "admin" | "manager" | "staff";
  branch_scope: "own_branch_only" | "selected_branches" | "all_branches";
  is_system: boolean;
  is_protected: boolean;
};

type Permission = {
  code: string;
  label: string;
  description: string | null;
  category: string;
  sort_order: number;
};

type Props = {
  roles: BusinessRole[];
  permissions: Permission[];
  rolePermissions: { role_id: string; permission_code: string }[];
  selectedRoleId?: string;
};

function scopeLabel(scope: BusinessRole["branch_scope"]) {
  if (scope === "all_branches") return "All Branches";
  if (scope === "own_branch_only") return "Own Branch Only";
  return "Selected Branches";
}

export function RoleManagement({ roles, permissions, rolePermissions, selectedRoleId }: Props) {
  const initialRole = roles.find((role) => role.id === selectedRoleId) ?? roles[0] ?? null;
  const [activeRoleId, setActiveRoleId] = useState(initialRole?.id ?? "");
  const [creating, setCreating] = useState(false);
  const activeRole = roles.find((role) => role.id === activeRoleId) ?? initialRole;

  const permissionMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const item of rolePermissions) {
      const set = map.get(item.role_id) ?? new Set<string>();
      set.add(item.permission_code);
      map.set(item.role_id, set);
    }
    return map;
  }, [rolePermissions]);

  const groupedPermissions = useMemo(() => {
    const groups = new Map<string, Permission[]>();
    for (const permission of permissions) {
      const list = groups.get(permission.category) ?? [];
      list.push(permission);
      groups.set(permission.category, list);
    }
    return [...groups.entries()];
  }, [permissions]);

  return (
    <section className={styles.shell}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarCopy}>
          <p className={styles.eyebrow}>Role-based access control</p>
          <h2>Roles</h2>
          <p className="muted">Role names are labels. The permissions selected here are the authority QueueDrop uses for employee access.</p>
        </div>
        <div className={styles.toolbarActions}>
          {!creating ? <button className={styles.createButton} type="button" onClick={() => setCreating(true)}>+ Create Custom Role</button> : null}
        </div>
      </div>

      <div className={styles.adminGrid}>
        <aside className={styles.listPanel} aria-label="Business roles">
          <div className={styles.listHeading}><strong>All Roles</strong><span className={styles.count}>{roles.length}</span></div>
          <div className={styles.roleList}>
            {roles.map((role) => {
              const selected = !creating && role.id === activeRoleId;
              return (
                <button key={role.id} type="button" className={`${styles.roleItem} ${selected ? styles.roleItemActive : ""}`} onClick={() => { setCreating(false); setActiveRoleId(role.id); }}>
                  <span className={`${styles.avatar} ${role.base_role === "admin" ? styles.avatarAdmin : role.base_role === "manager" ? styles.avatarManager : role.base_role === "staff" ? styles.avatarStaff : ""}`}>{role.name.slice(0, 1).toUpperCase()}</span>
                  <span className={styles.roleCopy}><strong>{role.name}</strong><small>{role.is_system ? "Default role" : "Custom role"}</small></span>
                </button>
              );
            })}
          </div>
        </aside>

        <div className={styles.detailPanel}>
          {creating ? (
            <RoleEditor
              mode="create"
              permissions={groupedPermissions}
              checkedPermissions={new Set(recommendedPermissionsForRole("staff"))}
              onCancel={() => setCreating(false)}
            />
          ) : activeRole ? (
            <RoleEditor
              key={activeRole.id}
              mode="edit"
              role={activeRole}
              permissions={groupedPermissions}
              checkedPermissions={permissionMap.get(activeRole.id) ?? new Set()}
            />
          ) : (
            <div className={styles.empty}><strong>No roles found.</strong><span>Create a custom role to start configuring employee access.</span></div>
          )}
        </div>
      </div>
    </section>
  );
}

function RoleEditor({
  mode,
  role,
  permissions,
  checkedPermissions,
  onCancel,
}: {
  mode: "create" | "edit";
  role?: BusinessRole;
  permissions: [string, Permission[]][];
  checkedPermissions: Set<string>;
  onCancel?: () => void;
}) {
  const protectedRole = Boolean(role?.is_protected);
  const action = mode === "create" ? createBusinessRole : updateBusinessRole;
  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(() => new Set(checkedPermissions));
  const [branchScope, setBranchScope] = useState<BusinessRole["branch_scope"]>(role?.branch_scope ?? "own_branch_only");

  const allPermissionCodes = permissions.flatMap(([, items]) => items.map((item) => item.code));
  const selectAll = allPermissionCodes.length > 0 && allPermissionCodes.every((code) => selectedPermissions.has(code));

  function applyPreset(preset: RecommendedRolePreset) {
    setSelectedPermissions(new Set(recommendedPermissionsForRole(preset)));
    setBranchScope(recommendedBranchScopeForRole(preset));
  }

  function togglePermission(code: string, checked: boolean) {
    setSelectedPermissions((current) => {
      const next = new Set(current);
      if (checked) next.add(code);
      else next.delete(code);
      return next;
    });
  }

  return (
    <form id={role ? `role-editor-${role.id}` : "role-editor-create"} action={action} className={styles.form}>
      {role ? <input type="hidden" name="role_id" value={role.id} /> : null}
      <div className={styles.detailHeading}>
        <div>
          <p className={styles.eyebrow}>{mode === "create" ? "New custom role" : role?.is_system ? "Default role" : "Custom role"}</p>
          <h3>{mode === "create" ? "Create Role" : "Role Details"}</h3>
        </div>
        {protectedRole ? <span className={styles.protectedChip}>Protected</span> : null}
      </div>

      {mode === "create" ? (
        <div className={styles.protectedNote}>
          <strong>Recommended permission preset</strong>
          <span>Start with QueueDrop&apos;s recommended access, then adjust any permission before saving.</span>
          <div className={styles.toolbarActions}>
            <button type="button" className={styles.secondaryButton} onClick={() => applyPreset("staff")}>Staff preset</button>
            <button type="button" className={styles.secondaryButton} onClick={() => applyPreset("manager")}>Manager preset</button>
          </div>
        </div>
      ) : null}

      <div className={styles.basicGrid}>
        <label className={styles.field}>
          Role Name
          <input name="name" defaultValue={role?.name ?? ""} minLength={2} maxLength={60} required disabled={protectedRole} placeholder="Receptionist" />
        </label>
        <div className={styles.field}>
          <span>Role Type</span>
          <div className={styles.protectedNote}>
            <strong>Declared business role</strong>
            <span>The role name and permissions you configure here define the employee role. QueueDrop handles the internal access profile automatically.</span>
          </div>
        </div>
        <label className={styles.field}>
          Description
          <input name="description" defaultValue={role?.description ?? ""} maxLength={240} disabled={protectedRole} placeholder="Handles stub queue operations" />
        </label>
        <label className={styles.field}>
          Branch Access Scope
          <select name="branch_scope" value={branchScope} onChange={(event) => setBranchScope(event.target.value as BusinessRole["branch_scope"])} disabled={protectedRole}>
            <option value="own_branch_only">Own Branch Only</option>
            <option value="selected_branches">Selected Branches</option>
            <option value="all_branches">All Branches</option>
          </select>
          {role ? <small>{scopeLabel(role.branch_scope)}</small> : null}
        </label>
      </div>

      <div className={styles.permissionsHeader}>
        <div><strong>Permissions</strong><small>Choose exactly what employees assigned to this role can do.</small></div>
        {!protectedRole ? (
          <label className={styles.selectAll}><input type="checkbox" checked={selectAll} onChange={(event) => setSelectedPermissions(event.target.checked ? new Set(allPermissionCodes) : new Set())} /><span>Select All</span></label>
        ) : null}
      </div>

      <div className={styles.permissionSections}>
        {permissions.map(([category, items]) => (
          <fieldset className={styles.permissionSection} key={category} disabled={protectedRole}>
            <legend>{category}</legend>
            <div className={styles.checkGrid}>
              {items.map((permission) => (
                <label className={styles.checkItem} key={permission.code} title={permission.description ?? undefined}>
                  <input
                    type="checkbox"
                    name="permissions"
                    value={permission.code}
                    checked={selectedPermissions.has(permission.code)}
                    onChange={(event) => togglePermission(permission.code, event.target.checked)}
                  />
                  <span>{permission.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>

      {protectedRole ? (
        <div className={styles.protectedNote}><strong>This role is protected.</strong><span>QueueDrop keeps ownership-critical system roles locked to prevent accidental loss of access.</span></div>
      ) : (
        <div className={styles.actions}>
          {mode === "create" && onCancel ? <button className={styles.secondaryButton} type="button" onClick={onCancel}>Cancel</button> : null}
          {mode === "create" ? <button className={styles.primaryButton} type="submit">Create Role</button> : <>
            <button className={styles.saveTopButton} type="submit">Save Role &amp; Permissions</button>
            <div className={styles.deleteRoleForm}><ConfirmDeleteSubmit formAction={deleteBusinessRole} className={styles.deleteRoleButton} message={`Delete role ${role?.name}? Users assigned to this role must be reassigned first.`} title="Delete role">Delete Role</ConfirmDeleteSubmit></div>
          </>}
        </div>
      )}
    </form>
  );
}
