import Link from 'next/link';
import { signUpWithPassword } from './actions';

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const sp = await searchParams;
  return (
    <div className="card mx-auto mt-12 max-w-md p-6">
      <h1 className="font-display text-2xl font-bold">Create your account</h1>
      <p className="mt-1 text-sm text-text-muted">
        Join TourneyPal to run tournaments, manage players, and track match history.
      </p>

      {sp.error && (
        <div className="mt-4 rounded-md border border-error/40 bg-error/10 px-3 py-2 text-sm text-red-300">
          {sp.error}
        </div>
      )}

      <form action={signUpWithPassword} className="mt-4 space-y-3">
        <input type="hidden" name="next" value={sp.next ?? '/'} />
        <div>
          <label className="label" htmlFor="display_name">Display name</label>
          <input className="input" id="display_name" name="display_name" required autoFocus />
        </div>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input className="input" id="email" name="email" type="email" required autoComplete="email" />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input
            className="input"
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
          />
          <p className="mt-1 text-xs text-text-muted">At least 8 characters.</p>
        </div>
        <button className="btn btn-primary w-full" type="submit">Create account</button>
      </form>

      <p className="mt-4 text-xs text-text-muted">
        Already have an account?{' '}
        <Link href={`/login${sp.next ? `?next=${encodeURIComponent(sp.next)}` : ''}`} className="font-semibold text-volt hover:text-volt-hover">
          Sign in
        </Link>
      </p>
    </div>
  );
}
