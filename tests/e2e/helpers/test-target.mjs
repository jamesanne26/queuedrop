export function isDedicatedTestTarget(baseUrl, env = process.env) {
  try {
    if (new URL(env.QUEUEDROP_TEST_SUPABASE_URL).hostname !== "tcgiwtfhqssulxwawimh.supabase.co") return false;
    const target = new URL(baseUrl);
    if (target.origin === "https://queuedrop-test.vercel.app") return true;
    return env.QUEUEDROP_E2E_RUNNER_LOCAL === "true" && target.origin === "http://127.0.0.1:3000";
  } catch { return false; }
}
