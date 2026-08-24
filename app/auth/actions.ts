"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function signIn(formData: FormData) {
  const email = value(formData, "login_email").toLowerCase();
  const password = value(formData, "password");
  const next = value(formData, "next") || "/dashboard";

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/auth/login?error=${encodeURIComponent(error.message)}&next=${encodeURIComponent(next)}`);
  }

  redirect(next.startsWith("/") ? next : "/dashboard");
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

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
