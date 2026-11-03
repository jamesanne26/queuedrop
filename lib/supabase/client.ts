import { createBrowserClient } from "@supabase/ssr";

declare global {
  interface ImportMetaEnv {
    readonly VITE_SUPABASE_URL?: string;
    readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  }
}

// Both Next.js and vinext compile NEXT_PUBLIC_* into browser bundles.
// Avoid import.meta.env here: Vite's build-time substitution can leave it
// undefined in client chunks despite a successful Cloudflare deployment.
export function createClient() {
  // Browser bundles use Vite's public environment injection on Cloudflare.
  // Next.js builds still use their standard NEXT_PUBLIC_ substitutions.
  // Both pairs contain public-only Supabase values, never the service-role key.
  const viteEnv = import.meta.env;
  const url = viteEnv?.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = viteEnv?.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error("Missing Supabase browser environment variables.");
  }

  return createBrowserClient(url, publishableKey);
}
