// Read-only, fail-closed Cloudflare TEST release preflight.
// A healthy Worker is not evidence that it runs the GitHub TEST revision.
import { pathToFileURL } from "node:url";

const TEST_APP_ORIGIN = "https://queuedrop-test.jamesrae-rosario18.workers.dev";
const TEST_DB_ORIGIN = "https://tcgiwtfhqssulxwawimh.supabase.co";

function exactHttpsOrigin(value, expected, label) {
  let url;
  try { url = new URL(value); } catch { throw new Error(`${label}: invalid URL`); }
  if (
    url.origin !== expected || url.protocol !== "https:" ||
    url.username || url.password || url.port ||
    url.pathname !== "/" || url.search || url.hash ||
    value !== expected && value !== `${expected}/`
  ) {
    throw new Error(`${label}: must be the exact dedicated TEST HTTPS origin`);
  }
  return expected;
}

export function assertCloudflareTestConfiguration({ baseUrl, supabaseUrl, sha }) {
  const origin = exactHttpsOrigin(baseUrl, TEST_APP_ORIGIN, "Cloudflare TEST");
  exactHttpsOrigin(supabaseUrl, TEST_DB_ORIGIN, "Supabase TEST");
  if (!/^[a-f0-9]{40}$/.test(sha ?? "")) {
    throw new Error("Expected GitHub TEST commit SHA must be a full 40-character lowercase SHA");
  }
  return { origin, expectedRevision: sha.slice(0, 12) };
}

export function assertCloudflareTestHealth(health, expectedRevision) {
  if (
    !health || health.status !== "ok" || health.database !== "ok" ||
    health.revision !== expectedRevision
  ) {
    throw new Error(
      "Cloudflare TEST is not verified for this GitHub TEST revision (health, database, or revision mismatch)",
    );
  }
  return true;
}

export async function verifyCloudflareTestRevision(config, fetchImpl = fetch) {
  const { origin, expectedRevision } = assertCloudflareTestConfiguration(config);
  const response = await fetchImpl(`${origin}/api/health`, {
    cache: "no-store",
    // Do not follow a TEST endpoint redirect to another environment.
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Cloudflare TEST health HTTP ${response.status}`);
  const health = await response.json();
  assertCloudflareTestHealth(health, expectedRevision);
  return expectedRevision;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const revision = await verifyCloudflareTestRevision({
      baseUrl: process.env.QUEUEDROP_TEST_BASE_URL,
      supabaseUrl: process.env.QUEUEDROP_TEST_SUPABASE_URL,
      sha: process.env.GITHUB_SHA,
    });
    console.log(`Cloudflare TEST is healthy at the exact GitHub TEST revision ${revision}.`);
  } catch (error) {
    console.error(`Cloudflare TEST release preflight BLOCKED: ${error.message}`);
    process.exitCode = 1;
  }
}
