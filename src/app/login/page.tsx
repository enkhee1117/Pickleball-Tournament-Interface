import { sendLoginLink } from './actions';

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string; next?: string }>;
}) {
  return <LoginForm searchParams={searchParams} />;
}

async function LoginForm({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string; next?: string }>;
}) {
  const sp = await searchParams;
  return (
    <div className="card mx-auto mt-12 max-w-md">
      <h1 className="text-2xl font-bold">Sign in</h1>
      <p className="mt-1 text-sm text-neutral-400">
        We&rsquo;ll email you a magic link. New here? Ask an admin to invite you.
      </p>

      {sp.sent && (
        <div className="mt-4 rounded border border-emerald-700 bg-emerald-950 px-3 py-2 text-sm text-emerald-300">
          Check your inbox for a sign-in link.
        </div>
      )}
      {sp.error && (
        <div className="mt-4 rounded border border-red-700 bg-red-950 px-3 py-2 text-sm text-red-300">
          {sp.error}
        </div>
      )}

      <form action={sendLoginLink} className="mt-4 space-y-3">
        <input type="hidden" name="next" value={sp.next ?? '/'} />
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input className="input" id="email" name="email" type="email" required autoFocus />
        </div>
        <button className="btn btn-primary w-full" type="submit">Send magic link</button>
      </form>

      <p className="mt-4 text-xs text-neutral-500">
        Have an invite link? Open it directly — it logs you in.
      </p>
    </div>
  );
}
