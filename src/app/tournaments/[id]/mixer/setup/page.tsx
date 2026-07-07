import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { THEME_COOKIE, readThemeFromCookie } from '@/lib/theme';
import { DesktopNav, DesktopSurface } from '@/components/desktop';
import { currentMixerRound, sortMixerRounds } from '@/lib/mixer-rounds';
import type { ConfigRow, RoundRow, TournamentRow } from '../_types';
import { setMixerAddon } from '../actions';
import { ActionForm } from '../_components/ActionForm';

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function MixerSetupPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const user = await getCurrentUser();
  const cookieStore = await cookies();
  const theme = readThemeFromCookie(cookieStore.get(THEME_COOKIE)?.value);

  const [{ data: tournament }, { data: member }, { data: config }, { data: rounds }] = await Promise.all([
    supabase.from('tournaments').select('id,name,format,owner_user_id,status,invite_code').eq('id', id).single(),
    user
      ? supabase.from('tournament_members').select('role').eq('tournament_id', id).eq('user_id', user.id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('event_config').select('*').eq('tournament_id', id).maybeSingle(),
    supabase.from('mixer_rounds').select('id,round_no,state,lock_at').eq('tournament_id', id).order('round_no', { ascending: true }),
  ]);

  if (!tournament) notFound();
  const t = tournament as TournamentRow;
  if (t.format !== 'partner_mixer') notFound();
  const role = (member as { role?: string } | null)?.role ?? null;
  const isManager = !!user && (user.id === t.owner_user_id || role === 'organizer' || role === 'admin');
  if (!isManager) notFound();

  const cfg = config as ConfigRow | null;
  const roundRows = sortMixerRounds((rounds ?? []) as RoundRow[]);
  const round = currentMixerRound(roundRows);
  // Format locks once the first draw has happened — integrity of the bracket.
  const locked = roundRows.some((r) => ['drawing', 'revealed', 'playing', 'done'].includes(r.state));
  const adminSetup = `/tournaments/${id}/mixer/admin?tab=setup`;

  const addons = cfg
    ? [
        { key: 'boosts', icon: '🪙', name: 'Token boosts', desc: 'Let players buy extra tokens for the partners they really want.', on: cfg.pay_to_play_enabled, setting: `${cfg.boost_tokens} boost tokens · $${cfg.boost_price} each · limit ${cfg.boost_limit}` },
        { key: 'downvotes', icon: '🚫', name: 'Rather-not downvotes', desc: 'Spend tokens to steer away from a pairing, not just toward one.', on: cfg.downvotes_enabled, setting: `Cap ${cfg.upvote_cap_per_target ?? 3} tokens per target` },
        { key: 'betting', icon: '💸', name: 'Pooled betting', desc: 'Friendly markets on who takes the night — a shared pot, not gambling.', on: cfg.betting_enabled, setting: `${Math.round(Number(cfg.betting_rake_pct) * 100)}% rake · ${cfg.betting_prize_winners} winners paid` },
        { key: 'raffle', icon: '🎟️', name: 'Raffle', desc: 'Everyone can win a prize — tickets earned by being a wanted teammate.', on: cfg.raffle_enabled, setting: `Prize: ${cfg.raffle_prize}` },
      ]
    : [];
  const onCount = addons.filter((a) => a.on).length;

  return (
    <DesktopSurface withCommandBar>
      <DesktopNav theme={theme} active="Tournaments" event={t.name} live={t.status === 'active'} />
      <main id="main" className="mx-auto w-full max-w-[1040px] px-4 pb-24 pt-6 sm:px-6 lg:px-8">
        <div className="text-[13px] text-ink-3">
          <Link href="/tournaments" className="hover:underline">Tournaments</Link> /{' '}
          <Link href={`/tournaments/${id}`} className="font-semibold text-ink hover:underline">{t.name}</Link> / Setup
        </div>
        <h1 className="serif mt-1.5 text-[34px] leading-none text-ink sm:text-[36px]">Setup</h1>
        <div className="mb-6 mt-2 text-[15px] text-ink-2">
          Change how the event runs — anytime, even mid-event. Add-ons flip on and off whenever you like.
        </div>


        {!cfg ? (
          <div className="rounded-2xl bg-white p-6 text-center" style={{ border: '1px dashed var(--line)' }}>
            <div className="text-[15px] font-semibold text-ink">Mixer isn&apos;t initialized yet</div>
            <div className="mt-1 text-xs text-ink-3">Initialize the event from the cockpit, then manage add-ons here.</div>
            <Link href={`/tournaments/${id}/mixer/admin`} className="mt-3.5 inline-block rounded-2xl px-5 py-3 text-[13px] font-semibold" style={{ background: 'var(--ink)', color: 'var(--paper)' }}>
              Open cockpit
            </Link>
          </div>
        ) : (
          <>
            <div className="mono mb-3.5 text-[11px] uppercase tracking-[0.12em] text-ink-3">Format</div>
            <div className="flex items-center gap-4 rounded-2xl bg-white px-5 py-4" style={{ border: '1px solid var(--line)' }}>
              <span className="text-[30px]">🎾</span>
              <div>
                <div className="text-[17px] font-semibold text-ink">Partner Mixer</div>
                <div className="text-[13px] text-ink-3">Blind partner vote → weighted draw → new teams each round.</div>
              </div>
              <div className="mono ml-auto flex items-center gap-1.5 text-[10px] uppercase tracking-[0.06em] text-ink-3">
                {locked ? (
                  <>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><rect x="5" y="10.5" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.5" /><path d="M8 10.5V8a4 4 0 018 0v2.5" stroke="currentColor" strokeWidth="1.5" /></svg>
                    Locked after round 1
                  </>
                ) : (
                  'Set at creation'
                )}
              </div>
            </div>

            <div className="mono mb-3.5 mt-7 text-[11px] uppercase tracking-[0.12em] text-ink-3">
              Add-ons — flip any of these on or off, even mid-event
            </div>
            <div className="flex flex-col gap-3.5">
              {addons.map((a) => (
                <AddonCard key={a.key} tournamentId={id} addon={a.key} icon={a.icon} name={a.name} desc={a.desc} on={a.on} setting={a.setting} adminSetup={adminSetup} />
              ))}
              {/* Live reveal is always available for a mixer — informational. */}
              <div className="overflow-hidden rounded-[18px] bg-white" style={{ border: '1.5px solid var(--line)' }}>
                <div className="flex items-center gap-4 px-5 py-[18px]">
                  <span className="grid h-[46px] w-[46px] place-items-center rounded-[13px] text-[23px]" style={{ background: 'var(--paper-2)' }}>📺</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-[16px] font-semibold text-ink">Live reveal / present</div>
                    <div className="mt-0.5 text-[13px] text-ink-2">A big-screen moment when each round&apos;s pairings lock — Big Board or Center Stage.</div>
                  </div>
                  <Link href={`/tournaments/${id}/mixer/present`} className="mono ml-auto shrink-0 text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: 'var(--court-deep)' }}>
                    Open present →
                  </Link>
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 mt-6 flex items-center gap-3.5 border-t py-4" style={{ background: 'color-mix(in oklch, var(--paper) 90%, transparent)', backdropFilter: 'blur(8px)', borderColor: 'var(--line)' }}>
              <span className="text-[13.5px] text-ink-2">
                <b className="text-ink">{onCount} add-on{onCount === 1 ? '' : 's'} on.</b> Changes apply from the next round.
              </span>
              <Link href={adminSetup} className="ml-auto rounded-btn px-4 py-2.5 text-[13px] font-semibold" style={{ background: 'var(--ink)', color: 'var(--paper)' }}>
                Fine-tune all settings →
              </Link>
            </div>
          </>
        )}
      </main>
    </DesktopSurface>
  );
}

function AddonCard({
  tournamentId,
  addon,
  icon,
  name,
  desc,
  on,
  setting,
  adminSetup,
}: {
  tournamentId: string;
  addon: string;
  icon: string;
  name: string;
  desc: string;
  on: boolean;
  setting: string;
  adminSetup: string;
}) {
  return (
    <div
      className="overflow-hidden rounded-[18px] bg-white"
      style={{ border: `1.5px solid ${on ? 'color-mix(in oklch, var(--court) 45%, var(--line))' : 'var(--line)'}` }}
    >
      <div className="flex items-center gap-4 px-5 py-[18px]">
        <span
          className="grid h-[46px] w-[46px] place-items-center rounded-[13px] text-[23px]"
          style={{ background: on ? 'color-mix(in oklch, var(--court) 16%, transparent)' : 'var(--paper-2)' }}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[16px] font-semibold text-ink">
            {name}
            <span className="mono rounded-md px-1.5 py-0.5 text-[9px] uppercase tracking-[0.06em]" style={{ background: 'color-mix(in oklch, var(--court) 14%, transparent)', color: 'var(--court-deep)' }}>
              any format
            </span>
          </div>
          <div className="mt-0.5 text-[13px] text-ink-2">{desc}</div>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-3.5">
          <span className="mono text-[10px] uppercase tracking-[0.06em]" style={{ color: on ? 'var(--court-deep)' : 'var(--ink-3)' }}>
            {on ? 'On' : 'Off'}
          </span>
          <ActionForm action={setMixerAddon}>
            <input type="hidden" name="tournament_id" value={tournamentId} />
            <input type="hidden" name="addon" value={addon} />
            <input type="hidden" name="enabled" value={on ? 'false' : 'true'} />
            <button
              type="submit"
              aria-label={`Turn ${name} ${on ? 'off' : 'on'}`}
              className="relative h-[29px] w-[50px] rounded-full transition-colors"
              style={{ background: on ? 'var(--court)' : 'var(--paper-2)', border: `1px solid ${on ? 'var(--court)' : 'var(--line)'}` }}
            >
              <span className="absolute top-[3px] h-[21px] w-[21px] rounded-full bg-white transition-[left]" style={{ left: on ? 24 : 3, boxShadow: '0 1px 3px rgba(0,0,0,.2)' }} />
            </button>
          </ActionForm>
        </div>
      </div>
      {on && (
        <div className="flex items-center justify-between gap-3 border-t px-5 py-3" style={{ borderColor: 'var(--line)', background: 'color-mix(in oklch, var(--paper-2) 30%, white)' }}>
          <span className="text-[12.5px] text-ink-2">{setting}</span>
          <Link href={adminSetup} className="mono shrink-0 text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: 'var(--court-deep)' }}>
            Fine-tune →
          </Link>
        </div>
      )}
    </div>
  );
}
