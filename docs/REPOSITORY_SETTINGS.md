# Recommended GitHub repository settings

These settings cannot be enforced by source files alone; enable them in GitHub when the team is ready.

For `main`: require pull requests, at least one approving review, dismissal of stale approvals, required status check `quality`, resolved conversations, and block force-push/deletion. Restrict direct pushes.

For `test`: require the `quality` status check and prefer PRs for team work. A release/operations owner may keep controlled direct push only while the team is small.

Enable secret scanning/dependency alerts where available. Configure Actions secrets with isolated TEST values; never store PROD service-role credentials in test workflows.
