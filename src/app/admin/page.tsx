import Link from 'next/link';
import { getProfile } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { createInvite, deleteInvite, setRole } from './actions';
import { TopBar } from '@/components/ui/TopBar';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Chip } from '@/components/ui/Chip';
import { Avatar, playerFromName } from '@/components/ui/Avatar';
import { Icons } from '@/components/ui/icons';
import type { Invite, Profile } from '@/lib/types';

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const me = await getProfile();
  if (!me || (me.role !== 'admin' && me.role !== 'organizer')) {
    return (
      <div className="flex min-h-full flex-col bg-paper">
        <TopBar
          title="Admin"
          left={
            <Link
              href="/"
              aria-label="Back"
              className="flex h-10 w-10 items-center justify-center rounded-xl"
              style={{ color: 'var(--ink)' }}
            >
              {Icons.back}
            </Link>
          }
        />
        <div className="px-[18px] pt-2">
          <div
            className="rounded-2xl bg-white p-5 text-center"
            style={{ border: '1px solid var(--line)' }}
          >
            <div className="text-[15px] font-semibold text-ink">Admins only</div>
            <div className="mt-1.5 text-xs text-ink-3">
              These tools are visible to organizers and admins.
            </div>
          </div>
        </div>
      </div>
    );
  }
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
    <div className="flex min-h-full flex-col bg-paper">
      <TopBar
        title="Admin"
        sub={`Signed in as ${me.role}`}
        left={
          <Link
            href="/"
            aria-label="Back"
            className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{ color: 'var(--ink)' }}
          >
            {Icons.back}
          </Link>
        }
      />

      <div className="flex-1 overflow-y-auto px-[18px] pb-24">
        {sp.error && (
          <div
            className="mb-3 rounded-xl border px-3 py-2 text-sm"
            style={{ borderColor: 'var(--berry)', color: 'var(--berry)', background: 'oklch(0.96 0.04 12)' }}
          >
            {sp.error}
          </div>
        )}
        {sp.ok && (
          <div
            className="mb-3 rounded-xl border px-3 py-2 text-sm"
            style={{ borderColor: 'var(--court-deep)', color: 'var(--court-deep)', background: 'oklch(0.96 0.04 140)' }}
          >
            {sp.ok}
          </div>
        )}

        <SectionHeader title="Invite a player" />
        <form
          action={createInvite}
          className="mb-3 grid gap-2 rounded-2xl bg-white p-3"
          style={{ border: '1px solid var(--line)' }}
        >
          <input
            name="email"
            type="email"
            required
            placeholder="player@email.com"
            className="rounded-xl bg-white px-3.5 py-2.5 text-sm text-ink outline-none"
            style={{ border: '1px solid var(--line)' }}
          />
          <div className="flex gap-2">
            <select
              name="role"
              defaultValue="player"
              className="flex-1 rounded-xl bg-white px-3.5 py-2.5 text-sm text-ink outline-none"
              style={{ border: '1px solid var(--line)' }}
            >
              <option value="player">player</option>
              <option value="organizer">organizer</option>
              {isAdmin && <option value="admin">admin</option>}
            </select>
            <button
              type="submit"
              className="rounded-xl px-4 py-2.5 text-sm font-semibold"
              style={{ background: 'var(--ink)', color: 'var(--paper)' }}
            >
              Create invite
            </button>
          </div>
        </form>

        <div className="mb-6 grid gap-2">
          {invites.length === 0 ? (
            <div
              className="rounded-2xl bg-white p-4 text-center text-sm text-ink-3"
              style={{ border: '1px dashed var(--line)' }}
            >
              No invites yet.
            </div>
          ) : (
            invites.map((inv) => {
              const expired = !inv.accepted_at && new Date(inv.expires_at) < new Date();
              const status = inv.accepted_at ? 'accepted' : expired ? 'expired' : 'pending';
              const link = `${baseUrl}/signup?token=${inv.token}`;
              return (
                <div
                  key={inv.id}
                  className="rounded-2xl bg-white p-3"
                  style={{ border: '1px solid var(--line)' }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-ink">{inv.email}</div>
                      <div className="mt-0.5 text-[11px] uppercase tracking-[0.04em] text-ink-3">
                        {inv.role}
                      </div>
                    </div>
                    <Chip tone={status === 'accepted' ? 'court' : status === 'pending' ? 'live' : 'ghost'}>
                      {status}
                    </Chip>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    {!inv.accepted_at && !expired ? (
                      <a
                        href={link}
                        target="_blank"
                        rel="noreferrer"
                        className="mono truncate text-[11px]"
                        style={{ color: 'var(--court-deep)' }}
                      >
                        {link}
                      </a>
                    ) : (
                      <span className="text-[11px] text-ink-3">—</span>
                    )}
                    {isAdmin && (
                      <form action={deleteInvite}>
                        <input type="hidden" name="id" value={inv.id} />
                        <button
                          type="submit"
                          className="text-[12px] font-semibold"
                          style={{ color: 'var(--berry)' }}
                        >
                          Delete
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {isAdmin && (
          <>
            <SectionHeader title="People & roles" mute={`${profiles.length} accounts`} />
            <div className="grid gap-2">
              {profiles.map((p) => {
                const name = p.display_name ?? p.full_name ?? p.id.slice(0, 8);
                const player = playerFromName(name);
                return (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 rounded-2xl bg-white p-3"
                    style={{ border: '1px solid var(--line)' }}
                  >
                    <Avatar player={player} size={40} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-ink">{name}</div>
                      <div className="text-[11px] text-ink-3">
                        {p.dupr_doubles ? `D ${p.dupr_doubles}` : ''}
                        {p.dupr_singles ? ` · S ${p.dupr_singles}` : ''}
                        {p.gender ? ` · ${p.gender.toUpperCase()}` : ''}
                      </div>
                    </div>
                    <form action={setRole} className="flex items-center gap-1.5">
                      <input type="hidden" name="user_id" value={p.id} />
                      <select
                        name="role"
                        defaultValue={p.role}
                        className="rounded-xl bg-white px-2.5 py-1.5 text-xs text-ink outline-none"
                        style={{ border: '1px solid var(--line)' }}
                      >
                        <option value="player">player</option>
                        <option value="organizer">organizer</option>
                        <option value="admin">admin</option>
                      </select>
                      <button
                        type="submit"
                        className="rounded-xl px-2.5 py-1.5 text-xs font-semibold"
                        style={{ background: 'var(--paper-2)', color: 'var(--ink)' }}
                      >
                        Save
                      </button>
                    </form>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
