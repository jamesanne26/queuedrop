import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";

export const createClient = cache(async function createClient() {
  const cookieStore = await cookies();
  const url = (process.env.SUPABASE_URL ?? process.env["NEXT_PUBLIC_SUPABASE_URL"]);
  const publishableKey = (process.env.SUPABASE_ANON_KEY ?? process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]);

  if (!url || !publishableKey) {
    throw new Error("Missing Supabase server environment variables.");
  }

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Server Components cannot always write cookies. Proxy refreshes sessions.
        }
      },
    },
  });
});

export const getAuthenticatedUser = cache(async function getAuthenticatedUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
});
