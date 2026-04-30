import { requireRole } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { createInvite, deleteInvite, setRole } from './actions';
import type { AppRole, Invite, Profile } from '@/lib/types';

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const me = await requireRole(['admin', 'organizer']);
  const sp = await searchParams;

  const admin = createAdminClient();
  const [{ data: invitesRaw }, { data: profilesRaw }] = await Promise.all([
    admin.from('invites').select('*').order('created_at', { ascending: false }).limit(100),
    admin.from('profiles').select('*').order('created_at', { ascending: false }).limit(500),
  ]);
  const invites = (invitesRaw ?? []) as Invite[];
  const profiles = (profilesRaw ?? []) as Profile[];

  const isAdmin = me.role === 'admin';
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? '';

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Admin</h1>
        <span className="text-xs text-neutral-500">Signed in as {me.role}</span>
      </header>

      {sp.error && (
        <div className="rounded border border-red-700 bg-red-950 px-3 py-2 text-sm text-red-300">{sp.error}</div>
      )}
      {sp.ok && (
        <div className="rounded border border-emerald-700 bg-emerald-950 px-3 py-2 text-sm text-emerald-300">{sp.ok}</div>
      )}

      <section className="card">
        <h2 className="text-lg font-bold">Invite a player</h2>
        <form action={createInvite} className="mt-3 flex flex-wrap items-end gap-3">
          <div className="min-w-64 flex-1">
            <label className="label">Email</label>
            <input className="input" name="email" type="email" required />
          </div>
          <div>
            <label className="label">Role</label>
            <select className="input" name="role" defaultValue="player">
              <option value="player">player</option>
              <option value="organizer">organizer</option>
              {isAdmin && <option value="admin">admin</option>}
            </select>
          </div>
          <button className="btn btn-primary" type="submit">Create invite</button>
        </form>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-neutral-500">
              <tr>
                <th className="py-2">Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Link</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {invites.map((inv) => {
                const expired = !inv.accepted_at && new Date(inv.expires_at) < new Date();
                const status = inv.accepted_at ? 'accepted' : expired ? 'expired' : 'pending';
                const link = `${baseUrl}/signup?token=${inv.token}`;
                return (
                  <tr key={inv.id} className="border-t border-neutral-800">
                    <td className="py-2">{inv.email}</td>
                    <td>{inv.role}</td>
                    <td>
                      <span className={
                        status === 'accepted' ? 'text-emerald-400'
                        : status === 'pending' ? 'text-amber-400'
                        : 'text-neutral-500'
                      }>{status}</span>
                    </td>
                    <td className="font-mono text-xs text-neutral-400">
                      {!inv.accepted_at && !expired ? (
                        <a href={link} className="underline" target="_blank" rel="noreferrer">copy link</a>
                      ) : '—'}
                    </td>
                    <td className="text-right">
                      {isAdmin && (
                        <form action={deleteInvite}>
                          <input type="hidden" name="id" value={inv.id} />
                          <button className="text-xs text-red-400 hover:underline" type="submit">delete</button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
              {invites.length === 0 && (
                <tr><td className="py-3 text-neutral-500" colSpan={5}>No invites yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {isAdmin && (
        <section className="card">
          <h2 className="text-lg font-bold">People &amp; roles</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-neutral-500">
                <tr><th className="py-2">Name</th><th>Role</th><th>DUPR</th><th></th></tr>
              </thead>
              <tbody>
                {profiles.map((p) => (
                  <tr key={p.id} className="border-t border-neutral-800">
                    <td className="py-2">{p.display_name ?? p.full_name ?? p.id.slice(0, 8)}</td>
                    <td>
                      <form action={setRole} className="flex items-center gap-2">
                        <input type="hidden" name="user_id" value={p.id} />
                        <select className="input !py-1" name="role" defaultValue={p.role}>
                          <option value="player">player</option>
                          <option value="organizer">organizer</option>
                          <option value="admin">admin</option>
                        </select>
                        <button className="btn btn-ghost !py-1 !px-2 text-xs" type="submit">save</button>
                      </form>
                    </td>
                    <td className="text-neutral-400">
                      {p.dupr_doubles ? `D ${p.dupr_doubles}` : '—'}{' '}
                      {p.dupr_singles ? `S ${p.dupr_singles}` : ''}
                    </td>
                    <td className="text-right text-xs text-neutral-500">{p.gender ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
