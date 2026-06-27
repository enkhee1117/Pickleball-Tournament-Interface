import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Tournament } from '@/lib/types';
import { Icons } from '@/components/ui/icons';
import { InviteTopBar } from './InviteTopBar';
import { WhatsAppToggle } from './WhatsAppToggle';
import { ShareCodeCard } from './ShareCodeCard';
import { formatInviteCode } from '@/lib/invite-codes';
import { setInviteWhatsApp } from './actions';
import { getCurrentUser } from '@/lib/auth';

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
  const user = await getCurrentUser();

  const memberRoleQuery = user
    ? supabase
        .from('tournament_members')
        .select('role')
        .eq('tournament_id', id)
        .eq('user_id', user.id)
        .maybeSingle()
    : Promise.resolve({ data: null });

  const [{ data: tournament }, { count: rosterCount }, { data: memberRow }] = await Promise.all([
    supabase
      .from('tournaments')
      .select('id,name,format,status,whatsapp_group_url,invite_code,owner_user_id')
      .eq('id', id)
      .single(),
    supabase
      .from('tournament_players')
      .select('id', { head: true, count: 'exact' })
      .eq('tournament_id', id),
    memberRoleQuery,
  ]);
  if (!tournament) notFound();
  const t = tournament as Tournament & { owner_user_id: string };
  const isMixer = t.format === 'partner_mixer';
  const inviteCode = formatInviteCode(t.invite_code);
  const isOwner = !!user && user.id === t.owner_user_id;
  const role = (memberRow as { role?: string } | null)?.role ?? null;
  const isManager = isOwner || role === 'organizer' || role === 'admin';

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
                Share the code below — manage the roster from Settings.
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

        {isManager ? (
          <WhatsAppToggle
            tournamentId={t.id}
            initialUrl={t.whatsapp_group_url ?? null}
            updateAction={setInviteWhatsApp}
          />
        ) : (
          t.whatsapp_group_url && (
            <a
              href={t.whatsapp_group_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mb-[18px] flex items-center gap-3.5 rounded-[18px] bg-white p-4 transition active:scale-[0.99]"
              style={{ border: '1px solid var(--line)' }}
            >
              <div
                className="flex h-12 w-12 items-center justify-center rounded-[14px] text-white"
                style={{ background: '#25D366' }}
              >
                {Icons.whatsapp}
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-ink">Open WhatsApp group</div>
                <div className="mt-0.5 text-xs text-ink-3">
                  Join the chat for live updates and chatter.
                </div>
              </div>
              <span className="text-ink-3">{Icons.arrow}</span>
            </a>
          )
        )}

        <div
          className="mt-3 rounded-2xl bg-white p-4 text-[13px]"
          style={{ border: '1px solid var(--line)', color: 'var(--ink-2)' }}
        >
          <div className="text-sm font-semibold text-ink">
            {rosterCount ?? 0} player{rosterCount === 1 ? '' : 's'} on the roster
          </div>
          <div className="mt-0.5 text-[12px] text-ink-3">
            {isManager
              ? isMixer
                ? 'Add players or open the Mixer controls to run voting and the reveal.'
                : 'Add players, edit names, or generate matches in Settings on the scoreboard.'
              : 'Open the scoreboard to see the roster, matches, and standings.'}
          </div>
        </div>

        <div className="mt-5 grid gap-2">
          <Link
            href={isMixer ? `/tournaments/${t.id}/mixer` : `/tournaments/${t.id}`}
            className="block w-full rounded-2xl px-5 py-[18px] text-center text-base font-semibold tracking-tight"
            style={{
              background: 'var(--ink)',
              color: 'var(--paper)',
              boxShadow: '0 4px 14px oklch(0.2 0.05 100 / 0.12)',
            }}
          >
            {isMixer ? 'Open Mixer →' : 'Open scoreboard →'}
          </Link>
          {isManager && (
            <Link
              href={isMixer ? `/tournaments/${t.id}/mixer/admin` : `/tournaments/${t.id}?tab=settings`}
              className="block w-full rounded-2xl px-5 py-3 text-center text-[13px] font-semibold"
              style={{ background: '#fff', color: 'var(--ink)', border: '1px solid var(--line)' }}
            >
              {isMixer ? 'Open Mixer controls →' : 'Manage roster + schedule →'}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
