// Release gate: browser E2E may access only the dedicated QueueDrop TEST project.
const TEST_SUPABASE_HOST = "tcgiwtfhqssulxwawimh.supabase.co";

export function assertTestSupabaseTarget(value, variable = "QUEUEDROP_TEST_SUPABASE_URL") {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${variable} must point to the dedicated QueueDrop TEST Supabase project.`);
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${variable} must be a valid HTTPS URL for the dedicated QueueDrop TEST Supabase project.`);
  }
  if (parsed.protocol !== "https:" || parsed.hostname !== TEST_SUPABASE_HOST ||
      parsed.username || parsed.password || parsed.port || parsed.pathname !== "/" ||
      parsed.search || parsed.hash) {
    throw new Error(`${variable} must point to the dedicated QueueDrop TEST Supabase project; refusing another environment.`);
  }
}
