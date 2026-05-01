import Link from 'next/link';
import { signInWithPassword } from './actions';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string; ok?: string }>;
}) {
  const sp = await searchParams;
  return (
    <div className="card mx-auto mt-12 max-w-md p-6">
      <h1 className="font-display text-2xl font-bold">Sign in</h1>
      <p className="mt-1 text-sm text-text-muted">
        Welcome back to TourneyPal. Enter your email and password to continue.
      </p>

      {sp.ok && (
        <div className="mt-4 rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm text-emerald-300">
          {sp.ok}
        </div>
      )}
      {sp.error && (
        <div className="mt-4 rounded-md border border-error/40 bg-error/10 px-3 py-2 text-sm text-red-300">
          {sp.error}
        </div>
      )}

      <form action={signInWithPassword} className="mt-4 space-y-3">
        <input type="hidden" name="next" value={sp.next ?? '/'} />
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input className="input" id="email" name="email" type="email" required autoFocus autoComplete="email" />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input className="input" id="password" name="password" type="password" required autoComplete="current-password" />
        </div>
        <button className="btn btn-primary w-full" type="submit">Sign in</button>
      </form>

      <p className="mt-4 text-xs text-text-muted">
        New to TourneyPal?{' '}
        <Link href={`/signup${sp.next ? `?next=${encodeURIComponent(sp.next)}` : ''}`} className="font-semibold text-volt hover:text-volt-hover">
          Create an account
        </Link>
      </p>
    </div>
  );
}
