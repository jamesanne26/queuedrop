import Link from "next/link";
import { signIn } from "../actions";
import { PasswordInput } from "../_components/password-input";
import { AuthSubmitButton } from "../_components/auth-submit-button";

type Props = {
  searchParams: Promise<{ error?: string; message?: string; next?: string }>;
};

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams;

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <Link href="/" className="brand-mark">QueueDrop</Link>
        <div className="auth-heading">
          <p className="eyebrow">Business access</p>
          <h1>Sign in to your workspace</h1>
          <p>Manage branches, staff, services, and live queues from one place.</p>
        </div>

        {params.error ? <div className="notice notice-error">{params.error}</div> : null}
        {params.message ? <div className="notice notice-success">{params.message}</div> : null}

        <form action={signIn} className="form-stack" data-no-global-loading="true">
          <input type="hidden" name="next" value={params.next ?? "/dashboard"} />
          <label>
            Email or mobile
            <input name="login_email" type="text" autoComplete="off" required placeholder="you@business.com or 09171234567" data-lpignore="true" data-1p-ignore="true" spellCheck={false} />
          </label>
          <label>
            Password
            <PasswordInput />
          </label>
          <div className="auth-forgot-link">
            <Link href="/auth/forgot-password">Forgot password?</Link>
          </div>
          <AuthSubmitButton pendingLabel="Signing in...">Sign in</AuthSubmitButton>
        </form>

        <p className="auth-footer">New to QueueDrop? <Link href="/auth/signup">Create an account</Link></p>
      </section>
    </main>
  );
}

