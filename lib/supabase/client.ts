import { createBrowserClient } from "@supabase/ssr";

declare global {
  interface ImportMetaEnv {
    readonly VITE_SUPABASE_URL?: string;
    readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  }
}

function publicMeta(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  return document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content || undefined;
}

export function createClient() {
  // Prefer bundled public values, but support Cloudflare vinext when the
  // browser chunk omits VITE_ and NEXT_PUBLIC_ substitutions.
  // RootLayout renders the same public values as escaped HTML meta attributes.
  const url = import.meta.env.VITE_SUPABASE_URL
    || process.env.NEXT_PUBLIC_SUPABASE_URL
    || publicMeta("queuedrop-supabase-url");
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    || publicMeta("queuedrop-supabase-publishable-key");

  if (!url || !publishableKey) {
    throw new Error("Missing Supabase browser environment variables.");
  }

  return createBrowserClient(url, publishableKey);
}
