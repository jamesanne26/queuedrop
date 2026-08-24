import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function safeNext(value: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//")
    ? value
    : "/dashboard";
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type");
  const next = safeNext(requestUrl.searchParams.get("next"));

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, requestUrl.origin));
    }
  } else if (tokenHash && type) {
    const otpTypes = [
      "signup",
      "invite",
      "magiclink",
      "recovery",
      "email_change",
      "email",
    ] as const;
    if ((otpTypes as readonly string[]).includes(type)) {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: type as (typeof otpTypes)[number],
      });
      if (!error) {
        return NextResponse.redirect(new URL(next, requestUrl.origin));
      }
    }
  }

  return NextResponse.redirect(
    new URL(
      "/auth/login?error=Unable%20to%20confirm%20your%20session.%20If%20your%20email%20is%20already%20confirmed%2C%20you%20can%20sign%20in.",
      requestUrl.origin,
    ),
  );
}
