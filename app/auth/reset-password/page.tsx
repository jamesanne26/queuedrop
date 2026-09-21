import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { updatePassword } from "../actions";
import { PasswordInput } from "../_components/password-input";
import { AuthSubmitButton } from "../_components/auth-submit-button";

type Props = {
  searchParams: Promise<{ error?: string }>;
};

export default async function ResetPasswordPage({ searchParams }: Props) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    redirect(`/auth/forgot-password?error=${encodeURIComponent("Your password reset link is invalid or has expired. Please request a new one.")}`);
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <Link href="/" className="brand-mark">QueueDrop</Link>
        <div className="auth-heading">
          <p className="eyebrow">Password recovery</p>
          <h1>Set a new password</h1>
          <p>Choose a new password for your QueueDrop account.</p>
        </div>

        {params.error ? <div className="notice notice-error">{params.error}</div> : null}

        <form action={updatePassword} className="form-stack" data-no-global-loading="true">
          <label>
            New password
            <PasswordInput name="password" autoComplete="new-password" placeholder="At least 8 characters" />
          </label>
          <label>
            Confirm new password
            <PasswordInput name="confirm_password" autoComplete="new-password" placeholder="Re-enter your new password" />
          </label>
          <AuthSubmitButton pendingLabel="Updating password...">Update password</AuthSubmitButton>
        </form>
      </section>
    </main>
  );
}
