"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { resolveAuthenticatedLanding } from "@/lib/auth/landing";

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function signIn(formData: FormData) {
  const identifier = value(formData, "login_email");
  const password = value(formData, "password");
  const next = value(formData, "next") || "/dashboard";

  const supabase = await createClient();
  let loginEmail = identifier.toLowerCase();

  if (!identifier.includes("@")) {
    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("id")
      .eq("phone", identifier)
      .limit(1)
      .maybeSingle();

    if (!profile) {
      redirect(`/auth/login?error=${encodeURIComponent("Invalid login credentials.")}&next=${encodeURIComponent(next)}`);
    }

    // QueueDrop phone-only accounts use a deterministic private Auth email.
    const crypto = await import("node:crypto");
    const digest = crypto.createHash("sha256").update(identifier).digest("hex");
    loginEmail = `phone-${digest}@auth.queuedrop.invalid`;
  }

  const { error } = await supabase.auth.signInWithPassword({
    email: loginEmail,
    password,
  });

  if (error) {
    redirect(`/auth/login?error=${encodeURIComponent(error.message)}&next=${encodeURIComponent(next)}`);
  }

  const { data: signedIn } = await supabase.auth.getUser();
  if (signedIn.user) {
    redirect(await resolveAuthenticatedLanding(supabase, signedIn.user, next));
  }
  redirect("/dashboard");
}

export async function signUp(formData: FormData) {
  const fullName = value(formData, "full_name");
  const email = value(formData, "email").toLowerCase();
  const password = value(formData, "password");

  if (fullName.length < 2) {
    redirect("/auth/signup?error=Please%20enter%20your%20name.");
  }

  if (password.length < 8) {
    redirect("/auth/signup?error=Password%20must%20be%20at%20least%208%20characters.");
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (!siteUrl) {
    redirect("/auth/signup?error=QueueDrop site URL is not configured.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: `${siteUrl}/auth/callback`,
    },
  });

  if (error) {
    redirect(`/auth/signup?error=${encodeURIComponent(error.message)}`);
  }

  if (data.session) {
    redirect("/dashboard");
  }

  redirect("/auth/login?message=Check%20your%20email%20to%20confirm%20your%20account.");
}

export async function requestPasswordReset(formData: FormData) {
  const email = value(formData, "email").toLowerCase();

  if (!email || !email.includes("@")) {
    redirect(`/auth/forgot-password?error=${encodeURIComponent("Please enter a valid email address.")}`);
  }

  // Keep the recovery request and its callback on the same host. This is
  // important for Supabase PKCE cookies in local, preview, and test builds.
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");
  const forwardedHost = requestHeaders.get("x-forwarded-host");
  const forwardedProto = requestHeaders.get("x-forwarded-proto") || "https";
  const host = forwardedHost || requestHeaders.get("host");
  const siteUrl = (
    origin ||
    (host ? `${forwardedProto}://${host}` : null) ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    ""
  ).replace(/\/$/, "");

  if (!siteUrl) {
    redirect(`/auth/forgot-password?error=${encodeURIComponent("Unable to determine the QueueDrop site URL.")}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/auth/callback?flow=recovery&next=${encodeURIComponent("/auth/reset-password")}`,
  });

  if (error) {
    redirect(`/auth/forgot-password?error=${encodeURIComponent(error.message)}`);
  }

  // Keep the response generic so the page does not reveal whether an account exists.
  redirect(`/auth/forgot-password?message=${encodeURIComponent("If an account exists for that email, a password reset link has been sent.")}`);
}

export async function updatePassword(formData: FormData) {
  const password = value(formData, "password");
  const confirmPassword = value(formData, "confirm_password");

  if (password.length < 8) {
    redirect(`/auth/reset-password?error=${encodeURIComponent("Password must be at least 8 characters.")}`);
  }

  if (password !== confirmPassword) {
    redirect(`/auth/reset-password?error=${encodeURIComponent("Passwords do not match.")}`);
  }

  const supabase = await createClient();
  const { data: currentUser } = await supabase.auth.getUser();

  if (!currentUser.user) {
    redirect(`/auth/forgot-password?error=${encodeURIComponent("Your password reset link is invalid or has expired. Please request a new one.")}`);
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    redirect(`/auth/reset-password?error=${encodeURIComponent(error.message)}`);
  }

  await supabase.auth.signOut();
  redirect(`/auth/login?message=${encodeURIComponent("Password updated successfully. Sign in with your new password.")}`);
}

export async function signOut() {
  const supabase = await createClient();
  // Signing out this browser must not revoke another device or QA session.
  await supabase.auth.signOut({ scope: "local" });
  redirect("/");
}
