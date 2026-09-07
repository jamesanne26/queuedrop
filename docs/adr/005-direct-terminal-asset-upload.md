# ADR 005: Direct terminal asset upload

Status: accepted.

Terminal logo/background binaries upload directly from the browser to the business-scoped `terminal-assets` bucket. The Server Action receives only validated storage paths. This avoids Server Action body-size limits and keeps binary transfer out of application actions.
