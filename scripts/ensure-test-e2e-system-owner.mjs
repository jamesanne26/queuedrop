import { createClient } from "@supabase/supabase-js";

const url = process.env.QUEUEDROP_TEST_SUPABASE_URL ?? "";
const key = process.env.QUEUEDROP_TEST_SUPABASE_SERVICE_ROLE_KEY ?? "";
const email = (process.env.E2E_OWNER_EMAIL ?? "").trim().toLowerCase();
const baseUrl = process.env.QUEUEDROP_TEST_BASE_URL ?? "";
if (!url.includes("tcgiwtfhqssulxwawimh.supabase.co") || !new URL(baseUrl).hostname.includes("queuedrop-test")) {
  throw new Error("Refusing to grant platform-owner permission outside the designated TEST environment");
}
if (!key || !email) throw new Error("Missing TEST service-role credentials or E2E owner email");

const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
let matched = null;
for (let page = 1; page <= 30; page++) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
  if (error) throw error;
  matched = data.users.find((user) => user.email?.toLowerCase() === email);
  if (matched) break;
  if (data.users.length < 100) break;
}
if (!matched) throw new Error("E2E owner email not found in TEST Auth; no permissions changed");
const { error } = await admin.from("system_owners").upsert({ user_id: matched.id, is_active: true }, { onConflict: "user_id" });
if (error) throw error;
console.log("Confirmed platform-owner permission for configured TEST E2E account (email omitted).");
