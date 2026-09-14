# QueueDrop Fresh Account Onboarding Fix — 2026-09-14

## Root cause
`enforce_business_user_subscription_limit()` called `get_subscription_access_state()` while the very first owner row was still being inserted. The access function requires an existing business membership, so a truly fresh account was rejected with `You do not have access to this subscription.`

## Fix
- Allow the subscription-limit trigger to pass while a brand-new business has no subscription yet.
- Move Starter trial creation inside `create_initial_business_workspace()` so business, owner, subscription, branch, branch access, queue defaults, and audit log commit or roll back together.
- Remove the second application-side admin upsert for the Starter trial.
- Make onboarding submit state explicit (`Creating workspace…`) to prevent confusing duplicate submissions.
- Show Starter trial as step 3 and make the post-submit flow clear.
- Add an integration test that creates a temporary fresh auth account, creates its first workspace, verifies owner + Starter trial + branch + subscription access, then cleans up.

## Required migration
`20260914110000_atomic_workspace_onboarding_trial.sql`
