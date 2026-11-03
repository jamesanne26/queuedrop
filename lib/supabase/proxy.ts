import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isProtectedRoute = pathname.startsWith("/dashboard");
  const isAuthRoute = pathname.startsWith("/auth/login") || pathname.startsWith("/auth/signup");

  // Cloudflare Workers Free has a tight CPU budget. Public pages, health,
  // assets and API handlers should not initialize the SSR Supabase client or
  // call Auth /user when they do not need the session for routing.
  if (!isProtectedRoute && !isAuthRoute) return NextResponse.next({ request });

  const hasAuthCookie = request.cookies.getAll().some(({ name }) =>
    name.startsWith("sb-") && (name.endsWith("-auth-token") || /-auth-token\.\d+$/.test(name))
  );
  if (!hasAuthCookie) {
    if (isProtectedRoute) {
      const toLogin = request.nextUrl.clone();
      toLogin.pathname = "/auth/login";
      toLogin.searchParams.set("next", pathname);
      return NextResponse.redirect(toLogin);
    }
    return NextResponse.next({ request });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    return new NextResponse("Auth configuration unavailable", { status: 503 });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // Validate the session against Supabase Auth instead of trusting only JWT claims.
  // This prevents redirect loops when a local db reset deletes auth.users while an
  // old browser cookie is still cryptographically valid.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthenticated = Boolean(user);
  if (isProtectedRoute && !isAuthenticated) {
    const urlToLogin = request.nextUrl.clone();
    urlToLogin.pathname = "/auth/login";
    urlToLogin.searchParams.set("next", pathname);
    return NextResponse.redirect(urlToLogin);
  }

  if (isAuthenticated && isAuthRoute) {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = "/dashboard";
    dashboardUrl.search = "";
    return NextResponse.redirect(dashboardUrl);
  }

  return response;
}
