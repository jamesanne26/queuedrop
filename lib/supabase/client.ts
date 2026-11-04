import { createBrowserClient } from "@supabase/ssr";
import { browserSupabaseUrl, browserSupabaseKey } from "./public-build-config";

// The Cloudflare build injects public-only literals into the imported module.
// Next.js builds continue using their NEXT_PUBLIC_* values.
export function createClient() {
  const url = browserSupabaseUrl.startsWith("https://")
    ? browserSupabaseUrl
    : process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = browserSupabaseKey.startsWith("__QUEUEDROP_")
    ? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    : browserSupabaseKey;

  if (!url || !publishableKey) {
    throw new Error("Missing Supabase browser environment variables.");
  }
  return createBrowserClient(url, publishableKey);
}
