"use client";

import { useState } from "react";
import { updateEmployeeAccess } from "./actions";

export type EmployeePermissions = Record<
  | "can_set_branch_status" | "can_manage_services" | "can_manage_operating_hours" | "can_manage_team" | "can_manage_kiosk_display"
  | "can_add_customer" | "can_edit_customer" | "can_call_customer" | "can_serve_customer" | "can_complete_ticket" | "can_cancel_ticket" | "can_mark_no_show" | "can_view_customer_contact"
  | "can_view_reports" | "can_export_reports" | "can_view_audit_logs" | "can_view_queue_information_editing" | "can_view_position_notifications",
  boolean
>;

const groups: { title: string; items: [keyof EmployeePermissions, string][] }[] = [
  { title: "Queue management", items: [["can_add_customer","Add customer"],["can_edit_customer","Edit customer"],["can_call_customer","Call next customer"],["can_serve_customer","Move to serving / pending"],["can_complete_ticket","Complete customer"],["can_cancel_ticket","Cancel customer"],["can_mark_no_show","Mark no show"],["can_view_customer_contact","View customer contact"]] },
  { title: "Business management", items: [["can_set_branch_status","Change branch status"],["can_manage_services","Manage services"],["can_manage_operating_hours","Manage operating hours"],["can_manage_team","Manage employees"],["can_manage_kiosk_display","Manage kiosk & display"]] },
  { title: "Settings & reports", items: [["can_view_queue_information_editing","Queue information settings"],["can_view_position_notifications","Position notification settings"],["can_view_reports","View reports"],["can_export_reports","Export reports"],["can_view_audit_logs","View audit logs"]] },
];

export function EmployeeAccessModal({ userId, memberName, customRoleName, permissions, viewBranch }: { userId: string; memberName: string; customRoleName: string; permissions: EmployeePermissions; viewBranch: string }) {
  const [open, setOpen] = useState(false);
  return <>
    <button className="button button-secondary button-small" type="button" onClick={() => setOpen(true)}>Role & permissions</button>
    {open ? <div className="qd-modal-backdrop" role="presentation">
      <section className="qd-modal qd-team-edit-modal role-permission-modal" role="dialog" aria-modal="true">
        <div className="qd-modal-header"><div><p className="eyebrow">Team & Roles</p><h2>{memberName}</h2><p className="muted">Declare the employee role and exactly what this role can access.</p></div><button className="qd-modal-close" type="button" onClick={() => setOpen(false)} aria-label="Close">×</button></div>
        <form action={updateEmployeeAccess} className="team-modal-form">
          <input type="hidden" name="user_id" value={userId}/><input type="hidden" name="view_branch" value={viewBranch}/>
          <label className="team-field">Role name<input name="custom_role_name" defaultValue={customRoleName} minLength={2} maxLength={60} required placeholder="Receptionist"/><small>Examples: Receptionist, Cashier, Barber, Stylist, Nurse, Doctor, Supervisor.</small></label>
          <div className="role-permission-groups">{groups.map(group => <fieldset className="role-permission-group" key={group.title}><legend>{group.title}</legend>{group.items.map(([key,label]) => <label key={key}><input type="checkbox" name={key} defaultChecked={permissions[key]}/><span>{label}</span></label>)}</fieldset>)}</div>
          <div className="role-access-note"><strong>Branch access is separate.</strong><span>Use Edit details to choose which branches this employee can access.</span></div>
          <div className="team-modal-actions"><button className="button button-secondary" type="button" onClick={() => setOpen(false)}>Cancel</button><button className="button button-primary" type="submit">Save role & permissions</button></div>
        </form>
      </section>
    </div> : null}
  </>;
}
