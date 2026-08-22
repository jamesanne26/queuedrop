import Link from "next/link";
import { signUp } from "../actions";

type Props = { searchParams: Promise<{ error?: string }> };

export default async function SignupPage({ searchParams }: Props) {
  const { error } = await searchParams;

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <Link href="/" className="brand-mark">QueueDrop</Link>
        <div className="auth-heading">
          <p className="eyebrow">Start your workspace</p>
          <h1>Create your QueueDrop account</h1>
          <p>Your account will become the owner identity for the business onboarding flow.</p>
        </div>

        {error ? <div className="notice notice-error">{error}</div> : null}

        <form action={signUp} className="form-stack">
          <label>
            Full name
            <input name="full_name" type="text" maxLength={100} required placeholder="Maria Santos" />
          </label>
          <label>
            Email
            <input name="email" type="email" autoComplete="email" required placeholder="you@business.com" />
          </label>
          <label>
            Password
            <input name="password" type="password" minLength={8} autoComplete="new-password" required placeholder="At least 8 characters" />
          </label>
          <button className="button button-primary" type="submit">Create account</button>
        </form>

        <p className="auth-footer">Already have an account? <Link href="/auth/login">Sign in</Link></p>
      </section>
    </main>
  );
}
