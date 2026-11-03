import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  const url = (import.meta.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
  const publishableKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

  if (!url || !publishableKey) {
    throw new Error("Missing Supabase browser environment variables.");
  }

  return createBrowserClient(url, publishableKey);
}
