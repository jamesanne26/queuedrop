import Link from "next/link";
import { requestPasswordReset } from "../actions";
import { AuthSubmitButton } from "../_components/auth-submit-button";

type Props = {
  searchParams: Promise<{ error?: string; message?: string }>;
};

export default async function ForgotPasswordPage({ searchParams }: Props) {
  const params = await searchParams;

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <Link href="/" className="brand-mark">QueueDrop</Link>
        <div className="auth-heading">
          <p className="eyebrow">Password recovery</p>
          <h1>Forgot your password?</h1>
          <p>Enter your account email and we&apos;ll send you a secure link to choose a new password.</p>
        </div>

        {params.error ? <div className="notice notice-error">{params.error}</div> : null}
        {params.message ? <div className="notice notice-success">{params.message}</div> : null}

        <form action={requestPasswordReset} className="form-stack" data-no-global-loading="true">
          <label>
            Email
            <input name="email" type="email" autoComplete="email" required placeholder="you@business.com" />
          </label>
          <AuthSubmitButton pendingLabel="Sending reset link...">Send reset link</AuthSubmitButton>
        </form>

        <p className="auth-footer">Remembered your password? <Link href="/auth/login">Back to sign in</Link></p>
      </section>
    </main>
  );
}
