import { createAdminClient } from '@/lib/supabase/admin';
import { acceptInvite } from './actions';

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const token = sp.token ?? '';

  if (!token) {
    return (
      <div className="card mx-auto mt-12 max-w-md">
        <h1 className="text-2xl font-bold">Invite required</h1>
        <p className="mt-2 text-sm text-neutral-400">
          Sign-ups are invite-only. Ask an admin to send you a link.
        </p>
      </div>
    );
  }

  const admin = createAdminClient();
  const { data: invite } = await admin
    .from('invites')
    .select('id, email, role, expires_at, accepted_at')
    .eq('token', token)
    .maybeSingle();

  if (!invite || invite.accepted_at || new Date(invite.expires_at) < new Date()) {
    return (
      <div className="card mx-auto mt-12 max-w-md">
        <h1 className="text-2xl font-bold">Invite invalid</h1>
        <p className="mt-2 text-sm text-neutral-400">
          This invite has expired or already been used.
        </p>
      </div>
    );
  }

  return (
    <div className="card mx-auto mt-12 max-w-md">
      <h1 className="text-2xl font-bold">Accept invite</h1>
      <p className="mt-1 text-sm text-neutral-400">
        Welcome. We&rsquo;ll email a sign-in link to{' '}
        <span className="font-mono text-neutral-200">{invite.email}</span>.
      </p>

      {sp.error && (
        <div className="mt-4 rounded border border-red-700 bg-red-950 px-3 py-2 text-sm text-red-300">
          {sp.error}
        </div>
      )}

      <form action={acceptInvite} className="mt-4 space-y-3">
        <input type="hidden" name="token" value={token} />
        <div>
          <label className="label" htmlFor="display_name">Display name</label>
          <input className="input" id="display_name" name="display_name" required />
        </div>
        <button className="btn btn-primary w-full" type="submit">Accept &amp; send link</button>
      </form>
    </div>
  );
}
