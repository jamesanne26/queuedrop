import { tmpdir } from "node:os";
import { join } from "node:path";

// CI-only session is outside the Git repository and Playwright artifacts.
export const reuseOwnerAuthState = Boolean(process.env.CI) && process.env.E2E_REUSE_AUTH_STATE === "1";
export const ownerAuthStatePath = join(tmpdir(), `queuedrop-e2e-owner-${process.env.GITHUB_RUN_ID || "local"}.json`);
