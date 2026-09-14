# QueueDrop Users & Roles finalization — 2026-09-14

## Final product behavior
- Email is required for every newly created or edited QueueDrop team user.
- Email is the login identifier for Manager and Staff accounts.
- Admin-created users receive a temporary password and sign in with email + that password.
- New user creation defaults to the Staff business role when available.
- Default client-facing roles are Admin, Manager, and Staff. Owner remains an account authority and stays hidden from employee-role assignment.
- Admin is protected and has full permissions.
- Manager and Staff are reusable default roles with recommended permission presets; owners/admins may adjust their permissions.
- Custom-role creation now exposes Staff and Manager preset buttons. Applying a preset checks recommended permissions and branch scope, after which the admin can customize individual permissions before saving.

## Backward compatibility
Legacy phone-only staff accounts are not deleted or auto-assigned fake real emails. When a legacy team account is edited, a real email is required and the Auth account is converted to email login.

## Database migration
`20260914234000_required_email_and_recommended_role_presets.sql`
- updates the new-business role seeder to create Admin + Manager + Staff,
- seeds permission presets for new businesses,
- adds a missing Manager role to existing businesses,
- repairs default roles that have no permission rows without overwriting customized non-empty Manager/Staff permission sets.
