import { createBrowserClient } from "@supabase/ssr";

// Both Next.js and vinext compile NEXT_PUBLIC_* into browser bundles.
// Avoid import.meta.env here: Vite's build-time substitution can leave it
// undefined in client chunks despite a successful Cloudflare deployment.
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error("Missing Supabase browser environment variables.");
  }

  return createBrowserClient(url, publishableKey);
}
