import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import type { Tournament } from '@/lib/types';
import { THEME_COOKIE, readThemeFromCookie } from '@/lib/theme';
import { DesktopNav, DesktopSurface } from '@/components/desktop';
import { Avatar, playerFromName } from '@/components/ui/Avatar';
import { Chip } from '@/components/ui/Chip';
import { Icons } from '@/components/ui/icons';
import { WhatsAppToggle } from './WhatsAppToggle';
import { ShareCodeCard } from './ShareCodeCard';
import { AddPlayerForm } from './AddPlayerForm';
import { formatInviteCode } from '@/lib/invite-codes';
import { setInviteWhatsApp } from './actions';
import { getCurrentUser } from '@/lib/auth';

type RosterPlayer = {
  id: string;
  display_name: string;
  profile_id: string | null;
  dupr: number | null;
  withdrawn_at: string | null;
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
  const user = await getCurrentUser();
  const cookieStore = await cookies();
  const theme = readThemeFromCookie(cookieStore.get(THEME_COOKIE)?.value);

  const memberRoleQuery = user
    ? supabase.from('tournament_members').select('role').eq('tournament_id', id).eq('user_id', user.id).maybeSingle()
    : Promise.resolve({ data: null });

  const [{ data: tournament }, { data: players }, { data: memberRow }] = await Promise.all([
    supabase.from('tournaments').select('id,name,format,status,whatsapp_group_url,invite_code,owner_user_id').eq('id', id).single(),
    supabase.from('tournament_players').select('id,display_name,profile_id,dupr,withdrawn_at').eq('tournament_id', id).order('created_at', { ascending: true }),
    memberRoleQuery,
  ]);
  if (!tournament) notFound();
  const t = tournament as Tournament & { owner_user_id: string };
  const isMixer = t.format === 'partner_mixer';
  const inviteCode = formatInviteCode(t.invite_code);
  const isOwner = !!user && user.id === t.owner_user_id;
  const role = (memberRow as { role?: string } | null)?.role ?? null;
  const isManager = isOwner || role === 'organizer' || role === 'admin';

  const roster = ((players ?? []) as RosterPlayer[]).filter((p) => !p.withdrawn_at);
  const total = roster.length;
  const claimed = roster.filter((p) => p.profile_id).length;
  const pct = total ? Math.round((claimed / total) * 100) : 0;
  const joinUrl = `https://trytodink.com/join?code=${t.invite_code}`;
  const mailto = `mailto:?subject=${encodeURIComponent(`Join ${t.name} on Try to Dink`)}&body=${encodeURIComponent(`Tap to join ${t.name}: ${joinUrl}\n\nOr enter code ${inviteCode} at trytodink.com/join`)}`;

  return (
    <DesktopSurface withCommandBar>
      <DesktopNav theme={theme} active="Tournaments" event={t.name} live={t.status === 'active'} />
      <main id="main" className="mx-auto w-full max-w-[1140px] px-4 pb-24 pt-6 sm:px-6 lg:px-8">
        <div className="mb-4 text-[13px] text-ink-3">
          <Link href="/tournaments" className="hover:underline">Tournaments</Link> /{' '}
          <Link href={`/tournaments/${id}`} className="font-semibold text-ink hover:underline">{t.name}</Link> / Invite
        </div>

        {isNew && (
          <div className="mb-6 flex items-center gap-4 rounded-[18px] p-5" style={{ background: 'linear-gradient(135deg, color-mix(in oklch, var(--court) 22%, white), white)', border: '1px solid color-mix(in oklch, var(--court) 30%, var(--line))' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/design-handoff/dink/uncle-sam.png" alt="" width={64} height={64} style={{ width: 64, height: 64, objectFit: 'contain' }} />
            <div className="min-w-0 flex-1">
              <div className="serif text-[22px] leading-tight text-ink">Tournament created — now fill the courts.</div>
              <div className="mt-1 text-[13px] text-ink-2">Share the code or link. Players tap in, pick a name, and they&apos;re on the roster.</div>
            </div>
            <Link href={`/tournaments/${id}`} className="shrink-0 text-[13px] font-semibold text-ink-3 hover:text-ink">Skip for now</Link>
          </div>
        )}

        {sp.error && (
          <div className="mb-4 rounded-xl border px-3 py-2 text-sm" style={{ borderColor: 'var(--berry)', color: 'var(--berry)', background: 'oklch(0.96 0.04 12)' }}>{sp.error}</div>
        )}
        {sp.ok && (
          <div className="mb-4 rounded-xl border px-3 py-2 text-sm" style={{ borderColor: 'var(--court-deep)', color: 'var(--court-deep)', background: 'oklch(0.96 0.04 140)' }}>{sp.ok}</div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          {/* LEFT — share tools */}
          <div className="flex flex-col gap-4">
            <ShareCodeCard inviteCode={inviteCode} rawInviteCode={t.invite_code} tournamentId={t.id} tournamentName={t.name} />

            {isManager ? (
              <WhatsAppToggle tournamentId={t.id} initialUrl={t.whatsapp_group_url ?? null} updateAction={setInviteWhatsApp} />
            ) : (
              t.whatsapp_group_url && (
                <a href={t.whatsapp_group_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3.5 rounded-[18px] bg-white p-4" style={{ border: '1px solid var(--line)' }}>
                  <div className="flex h-12 w-12 items-center justify-center rounded-[14px] text-white" style={{ background: '#25D366' }}>{Icons.whatsapp}</div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-ink">Open WhatsApp group</div>
                    <div className="mt-0.5 text-xs text-ink-3">Join the chat for live updates and chatter.</div>
                  </div>
                  <span className="text-ink-3">{Icons.arrow}</span>
                </a>
              )
            )}

            <a href={mailto} className="flex items-center gap-3.5 rounded-[18px] bg-white p-4" style={{ border: '1px solid var(--line)' }}>
              <div className="flex h-12 w-12 items-center justify-center rounded-[14px] text-white" style={{ background: 'var(--ink)' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M4 6h16v12H4z" stroke="#fff" strokeWidth="1.7" /><path d="M4 7l8 6 8-6" stroke="#fff" strokeWidth="1.7" /></svg>
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-ink">Email invite</div>
                <div className="mt-0.5 text-xs text-ink-3">Open a pre-filled message with the join link.</div>
              </div>
              <span className="text-ink-3">{Icons.arrow}</span>
            </a>
          </div>

          {/* RIGHT — roster */}
          <div className="rounded-[18px] bg-white p-5" style={{ border: '1px solid var(--line)' }}>
            <div className="flex items-center justify-between gap-3">
              <div className="text-[17px] font-semibold text-ink">
                Roster <span className="text-[13px] font-normal text-ink-3">{total} player{total === 1 ? '' : 's'}</span>
              </div>
              {total > 0 && (
                <span className="mono text-[11px] uppercase tracking-[0.06em] text-ink-3">{claimed} of {total} claimed</span>
              )}
            </div>
            {total > 0 && (
              <div className="mt-3 h-2 overflow-hidden rounded-full" style={{ background: 'var(--paper-2)' }}>
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--court)' }} />
              </div>
            )}

            <div className="mt-4 flex flex-col gap-2">
              {roster.length === 0 ? (
                <div className="rounded-2xl p-5 text-center text-sm text-ink-3" style={{ border: '1px dashed var(--line)' }}>
                  No players yet. Share the code above or add someone below.
                </div>
              ) : (
                roster.map((p) => {
                  const handle = p.display_name.toLowerCase().split(' ').filter(Boolean)[0] ?? 'player';
                  return (
                    <div key={p.id} className="flex items-center gap-3 rounded-2xl px-3 py-2.5" style={{ background: 'color-mix(in oklch, var(--paper-2) 40%, white)', border: '1px solid var(--line)' }}>
                      <Avatar player={playerFromName(p.display_name)} size={34} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14px] font-semibold text-ink">{p.display_name}</div>
                        <div className="mono text-[10px] uppercase tracking-[0.04em] text-ink-3">{p.profile_id ? `@${handle}` : 'Anon · via code'}</div>
                      </div>
                      {p.dupr != null && <span className="mono text-[12px] text-ink-2">{Number(p.dupr).toFixed(2)}</span>}
                      <Chip tone={p.profile_id ? 'court' : 'ghost'}>{p.profile_id ? 'Claimed' : 'Open'}</Chip>
                    </div>
                  );
                })
              )}
            </div>

            {isManager && (
              <div className="mt-4 border-t pt-4" style={{ borderColor: 'var(--line)' }}>
                <AddPlayerForm
                  tournamentId={t.id}
                  tournamentName={t.name}
                  inviteCode={t.invite_code}
                  existingProfileIds={roster.flatMap((p) => (p.profile_id ? [p.profile_id] : []))}
                />
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4" style={{ borderColor: 'var(--line)' }}>
              <div className="text-[13px] text-ink-2">
                {isManager ? (
                  <><b className="text-ink">{total} in.</b> Start with who you have — add players live any time.</>
                ) : (
                  'Ask the organizer to add you, or join with the code.'
                )}
              </div>
              <div className="flex gap-2.5">
                {isManager && (
                  <Link href={isMixer ? `/tournaments/${t.id}?tab=settings` : `/tournaments/${t.id}?tab=settings`} className="rounded-btn border px-4 py-2.5 text-[13px] font-semibold" style={{ borderColor: 'var(--line)', color: 'var(--ink)', background: 'white' }}>
                    Edit roster
                  </Link>
                )}
                <Link href={isMixer ? `/tournaments/${t.id}/mixer/admin` : `/tournaments/${t.id}`} className="rounded-btn px-4 py-2.5 text-[13px] font-semibold" style={{ background: 'var(--ink)', color: 'var(--paper)' }}>
                  {isMixer && isManager ? 'Open the vote →' : 'Open event →'}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
    </DesktopSurface>
  );
}
