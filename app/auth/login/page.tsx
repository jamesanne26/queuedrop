import Link from "next/link";
import { signIn } from "../actions";
import { PasswordInput } from "./password-input";

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

        <form action={signIn} className="form-stack">
          <input type="hidden" name="next" value={params.next ?? "/dashboard"} />
          <label>
            Email
            <input name="login_email" type="email" autoComplete="off" required placeholder="you@business.com" data-lpignore="true" data-1p-ignore="true" spellCheck={false} />
          </label>
          <label>
            Password
            <PasswordInput />
          </label>
          <button className="button button-primary" type="submit">Sign in</button>
        </form>

        <p className="auth-footer">New to QueueDrop? <Link href="/auth/signup">Create an account</Link></p>
      </section>
    </main>
  );
}

