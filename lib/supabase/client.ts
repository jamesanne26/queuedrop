import { createBrowserClient } from "@supabase/ssr";

declare global {
  interface ImportMetaEnv {
    readonly VITE_SUPABASE_URL?: string;
    readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  }
}

// Keep build-time references static so both Vite/vinext and Next.js can
// replace the public values in browser bundles. Never embed service-role keys.
export function createClient() {
  const url =
    import.meta.env.VITE_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error("Missing Supabase browser environment variables.");
  }

  return createBrowserClient(url, publishableKey);
}
