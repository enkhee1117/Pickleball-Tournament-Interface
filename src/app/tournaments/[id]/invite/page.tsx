import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Tournament } from '@/lib/types';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { InviteTopBar } from './InviteTopBar';
import { WhatsAppToggle } from './WhatsAppToggle';
import { ShareCodeCard } from './ShareCodeCard';
import { RosterRow } from './RosterRow';
import { formatInviteCode } from '@/lib/invite-codes';
import { addInvitePlayer, setInviteWhatsApp } from './actions';

type PlayerRow = {
  id: string;
  display_name: string;
  email: string | null;
  profile_id: string | null;
};

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ new?: string; ok?: string; error?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const isNew = sp.new === '1';
  const supabase = await createClient();

  const [{ data: tournament }, { data: players }, { data: { user } }] = await Promise.all([
    supabase
      .from('tournaments')
      .select('id,name,format,status,whatsapp_group_url,invite_code,owner_user_id')
      .eq('id', id)
      .single(),
    supabase
      .from('tournament_players')
      .select('id,display_name,email,profile_id')
      .eq('tournament_id', id)
      .order('created_at', { ascending: true }),
    supabase.auth.getUser(),
  ]);
  if (!tournament) notFound();
  const t = tournament as Tournament & { owner_user_id: string };
  const roster = (players ?? []) as PlayerRow[];
  const inviteCode = formatInviteCode(t.invite_code);
  const userHasClaimedSlot = !!user && roster.some((p) => p.profile_id === user.id);
  const isOwner = !!user && user.id === t.owner_user_id;
  let isManager = isOwner;
  if (user && !isOwner) {
    const { data: member } = await supabase
      .from('tournament_members')
      .select('role')
      .eq('tournament_id', id)
      .eq('user_id', user.id)
      .maybeSingle();
    isManager = member?.role === 'organizer' || member?.role === 'admin';
  }

  return (
    <div className="flex min-h-full flex-col bg-paper">
      <InviteTopBar tournamentId={id} isNew={isNew} />

      <div className="flex-1 overflow-y-auto px-[18px] pb-6 pt-1">
        {isNew && (
          <div
            className="mb-4 flex items-center gap-3 rounded-2xl p-4"
            style={{ background: 'var(--court)' }}
          >
            <div className="text-[28px]">🎉</div>
            <div>
              <div className="text-sm font-semibold text-ink">Tournament created!</div>
              <div className="mt-0.5 text-xs" style={{ color: 'oklch(0.3 0.05 140)' }}>
                Now get the gang in here.
              </div>
            </div>
          </div>
        )}

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

        <ShareCodeCard
          inviteCode={inviteCode}
          rawInviteCode={t.invite_code}
          tournamentId={t.id}
          tournamentName={t.name}
        />

        <WhatsAppToggle
          tournamentId={t.id}
          initialUrl={t.whatsapp_group_url ?? null}
          updateAction={setInviteWhatsApp}
        />

        <SectionHeader
          title="Roster"
          mute={`${roster.length} confirmed`}
          action={isManager ? <span>Add player</span> : null}
        />

        {isManager && (
          <form action={addInvitePlayer} className="mb-3 grid gap-2">
            <input type="hidden" name="tournament_id" value={t.id} />
            <input
              name="display_name"
              placeholder="Player name"
              required
              className="rounded-xl bg-white px-3.5 py-3 text-sm text-ink outline-none"
              style={{ border: '1px solid var(--line)' }}
            />
            <div className="flex gap-2">
              <input
                name="email"
                type="email"
                placeholder="Email (optional — links them to history)"
                className="flex-1 rounded-xl bg-white px-3.5 py-3 text-sm text-ink outline-none"
                style={{ border: '1px solid var(--line)' }}
              />
              <button
                type="submit"
                className="rounded-xl px-4 text-sm font-semibold"
                style={{ background: 'var(--ink)', color: 'var(--paper)' }}
              >
                Add
              </button>
            </div>
          </form>
        )}

        <div className="mb-5 grid gap-2">
          {roster.length === 0 ? (
            <div
              className="rounded-2xl bg-white p-4 text-center text-sm text-ink-3"
              style={{ border: '1px dashed var(--line)' }}
            >
              {isManager ? 'No players yet. Add a few above to get started.' : 'Roster is empty so far.'}
            </div>
          ) : (
            roster.map((p) => (
              <RosterRow
                key={p.id}
                tournamentId={t.id}
                player={p}
                currentUserId={user?.id ?? null}
                userHasClaimedSlot={userHasClaimedSlot}
                canManage={isManager}
              />
            ))
          )}
        </div>

        <div className="mt-5">
          <Link
            href={`/tournaments/${t.id}`}
            className="block w-full rounded-2xl px-5 py-[18px] text-center text-base font-semibold tracking-tight"
            style={{
              background: 'var(--ink)',
              color: 'var(--paper)',
              boxShadow: '0 4px 14px oklch(0.2 0.05 100 / 0.12)',
            }}
          >
            Open scoreboard →
          </Link>
        </div>
        {isManager && (
          <div className="mt-2 text-center text-[11px] text-ink-3">
            Generating or resetting matches lives in the Settings tab on the scoreboard.
          </div>
        )}
      </div>
    </div>
  );
}
