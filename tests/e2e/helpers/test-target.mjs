const TEST_SUPABASE_HOST = "tcgiwtfhqssulxwawimh.supabase.co";
const TEST_VERCEL_ORIGIN = "https://queuedrop-test.vercel.app";
const LOCAL_RUNNER_ORIGIN = "http://127.0.0.1:3000";

export function isDedicatedTestTarget(baseUrl, env = process.env) {
  try {
    const db = new URL(env.QUEUEDROP_TEST_SUPABASE_URL);
    if (db.protocol !== "https:" || db.hostname !== TEST_SUPABASE_HOST || db.port || db.username || db.password || db.pathname !== "/" || db.search || db.hash) return false;

    const target = new URL(baseUrl);
    if (target.username || target.password || target.pathname !== "/" || target.search || target.hash) return false;
    if (target.origin === TEST_VERCEL_ORIGIN) return true;
    return env.QUEUEDROP_E2E_RUNNER_LOCAL === "true" && target.origin === LOCAL_RUNNER_ORIGIN;
  } catch { return false; }
}
