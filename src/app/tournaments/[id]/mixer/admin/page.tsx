import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { formatInviteCode } from '@/lib/invite-codes';
import { TopBar } from '@/components/ui/TopBar';
import { Chip } from '@/components/ui/Chip';
import { Icons } from '@/components/ui/icons';
import { currentMixerRound, sortMixerRounds } from '@/lib/mixer-rounds';
import { ShareCodeCard } from '../../invite/ShareCodeCard';
import { MixerModeSwitch } from '../MixerModeSwitch';
import { MixerRealtimeSync } from '../MixerRealtimeSync';
import {
  drawMixerRound,
  finalizeMixerEvent,
  initializeMixerEvent,
  scoreMixerCourt,
  updateMixerPlayerPool,
} from '../actions';
import type {
  ConfigRow,
  PairingRow,
  PaymentRow,
  PlayerRow,
  RoundRow,
  ScoreRow,
  StateRow,
  TournamentRow,
} from '../_types';
import { ConfigForm } from '../_components/ConfigForm';
import {
  formatLockDuration,
  getOrganizerTab,
  normalizePrizeBuckets,
  runEventBody,
  runEventHeadline,
} from '../_components/admin-helpers';
import { normalizePaymentMethods } from '../_components/payment-methods';
import {
  AdminLink,
  Notice,
  OrganizerTabNav,
  PaymentButton,
  PrizeBucket,
  RoundRail,
  Section,
  Stat,
  StateButton,
} from '../_components/admin-ui';

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; ok?: string; error?: string }>;
};

type BetSummaryRow = {
  market_place: number;
  total_chips: number;
  bet_count: number;
};

type SnapshotRow = {
  standings: unknown;
  raffle_tickets: unknown;
  raffle_winner: unknown;
  bet_settlements: unknown;
};

export default async function MixerAdminPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const user = await getCurrentUser();

  const [
    { data: tournament },
    { data: member },
    { data: config },
    { data: rounds },
    { data: players },
  ] = await Promise.all([
    supabase.from('tournaments').select('id,name,format,owner_user_id,status,invite_code').eq('id', id).single(),
    user
      ? supabase.from('tournament_members').select('role').eq('tournament_id', id).eq('user_id', user.id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('event_config').select('*').eq('tournament_id', id).maybeSingle(),
    supabase.from('mixer_rounds').select('id,round_no,state,lock_at').eq('tournament_id', id).order('round_no', { ascending: true }),
    supabase.from('tournament_players').select('id,display_name,gender,profile_id,withdrawn_at').eq('tournament_id', id).order('created_at', { ascending: true }),
  ]);

  if (!tournament) notFound();
  const t = tournament as TournamentRow;
  if (t.format !== 'partner_mixer') notFound();
  const role = (member as { role?: string } | null)?.role ?? null;
  const isManager = !!user && (user.id === t.owner_user_id || role === 'organizer' || role === 'admin');
  if (!isManager) notFound();

  const cfg = config as ConfigRow | null;
  const roundRows = sortMixerRounds((rounds ?? []) as RoundRow[]);
  const currentRound = currentMixerRound(roundRows);
  const roster = (players ?? []) as PlayerRow[];

  const [{ data: pairings }, { data: scores }, { data: payments }, { data: states }, { data: betsSummary }, { data: snapshot }] = await Promise.all([
    currentRound
      ? supabase.from('mixer_pairings').select('id,player_a_id,player_b_id,court_no').eq('round_id', currentRound.id).order('court_no', { ascending: true })
      : Promise.resolve({ data: [] }),
    currentRound
      ? supabase.from('mixer_scores').select('court_no,team_a_score,team_b_score,completed_at').eq('round_id', currentRound.id)
      : Promise.resolve({ data: [] }),
    supabase.from('payments').select('id,player_id,type,amount,method,status').eq('tournament_id', id).order('created_at', { ascending: false }).limit(50),
    supabase.from('player_event_state').select('player_id,pairing_pool,tokens_base_remaining,tokens_bought_remaining,chips_remaining,sit_out_count').eq('tournament_id', id),
    // Aggregated server-side via app_mixer_bets_summary so admins never see
    // per-row (bettor_player_id, chips) — only market liquidity totals.
    supabase.rpc('app_mixer_bets_summary', { p_tournament_id: id }),
    supabase.from('mixer_final_snapshots').select('standings,raffle_tickets,raffle_winner,bet_settlements').eq('tournament_id', id).maybeSingle(),
  ]);

  const pairingRows = (pairings ?? []) as PairingRow[];
  const scoreRows = (scores ?? []) as ScoreRow[];
  const paymentRows = (payments ?? []) as PaymentRow[];
  const stateRows = (states ?? []) as StateRow[];
  const betSummaryRows = (betsSummary ?? []) as BetSummaryRow[];
  const final = snapshot as SnapshotRow | null;
  const name = (playerId: string) => roster.find((p) => p.id === playerId)?.display_name ?? 'TBD';
  const paidCount = paymentRows.filter((p) => p.type === 'entry' && p.status === 'confirmed').length;
  const pendingPayments = paymentRows.filter((p) => p.status === 'pending').length;
  const betChips = betSummaryRows.reduce((sum, b) => sum + b.total_chips, 0);
  const prizeBuckets = normalizePrizeBuckets(cfg?.prize_buckets);
  const paymentMethods = normalizePaymentMethods(cfg?.payment_methods);
  const finalStandings = Array.isArray(final?.standings) ? final.standings : [];
  const raffleWinner = final?.raffle_winner && !Array.isArray(final.raffle_winner) ? final.raffle_winner as Record<string, unknown> : null;
  const activeTab = getOrganizerTab(sp.tab);
  const drawStarted = roundRows.some((round) => ['drawing', 'revealed', 'playing', 'done'].includes(round.state));
  const hasOpenBallots = roundRows.some((round) => round.state === 'open');
  const hasLockedBallots = roundRows.some((round) => round.state === 'locked');
  const currentCourtCount = new Set(pairingRows.map((pairing) => pairing.court_no)).size;
  const scoredCourtCount = scoreRows.filter((score) => score.completed_at).length;
  const canOpenBallot = !!currentRound && !drawStarted && hasLockedBallots;
  const canLockBallot = !!currentRound && hasOpenBallots && !drawStarted;
  const canDraw = currentRound?.state === 'locked';
  const canStartPlay = currentRound?.state === 'revealed';
  const canMarkDone = (currentRound?.state === 'playing' || currentRound?.state === 'revealed') && (currentCourtCount === 0 || scoredCourtCount >= currentCourtCount);

  return (
    <div className="flex min-h-full flex-col bg-paper">
      <MixerRealtimeSync tournamentId={id} />
      <div className="bg-ink px-[18px] pb-[18px] text-paper">
        <TopBar
          dark
          title={t.name}
          sub="Organizer mode"
          left={<Link href={`/tournaments/${id}`} className="flex h-10 w-10 items-center justify-center rounded-xl">{Icons.back}</Link>}
          right={
            <div className="flex items-center gap-1">
              <Link href={`/tournaments/${id}/invite`} aria-label="Invite players" className="flex h-10 w-10 items-center justify-center rounded-xl">{Icons.share}</Link>
            </div>
          }
        />
        <MixerModeSwitch tournamentId={id} active="organizer" />
        <div className="pl-1">
          <Chip tone="live">{currentRound ? currentRound.state : 'SETUP'}</Chip>
          <div className="serif mt-2 text-[34px] leading-none">Run the event</div>
          <div className="mt-1 text-xs opacity-60">{roster.length} players · {cfg?.courts ?? 3} courts</div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-[18px] py-4 pb-24">
        {sp.error && <Notice tone="error">{sp.error}</Notice>}
        {sp.ok && <Notice tone="ok">{sp.ok}</Notice>}

        {!cfg || !currentRound ? (
          <form action={initializeMixerEvent} className="rounded-2xl bg-white p-5 text-center" style={{ border: '1px dashed var(--line)' }}>
            <input type="hidden" name="tournament_id" value={id} />
            <div className="text-[15px] font-semibold text-ink">Mixer config is not initialized</div>
            <div className="mt-1 text-xs text-ink-3">Create default tokens, chips, Round 1, and player event state.</div>
            <button className="mt-4 rounded-2xl px-5 py-3 text-sm font-semibold" style={{ background: 'var(--court)', color: 'oklch(0.2 0.04 140)' }}>
              Initialize Mixer
            </button>
          </form>
        ) : (
          <>
            <OrganizerTabNav tournamentId={id} active={activeTab} pendingPayments={pendingPayments} />

            {activeTab === 'run' && (
              <>
                <Section title="Round state">
                  <div className="rounded-2xl bg-white p-4" style={{ border: '1px solid var(--line)' }}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-3">Round {currentRound.round_no} of {cfg.rounds}</div>
                        <div className="serif mt-1 text-[26px] leading-none text-ink">{runEventHeadline(currentRound.state)}</div>
                        <div className="mt-2 text-sm leading-5 text-ink-3">{runEventBody(currentRound.state, cfg.lock_mode)}</div>
                      </div>
                      <Chip tone={currentRound.state === 'open' || currentRound.state === 'playing' ? 'live' : 'court'}>{currentRound.state}</Chip>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <Stat label="Players" value={roster.length} />
                      <Stat label="Courts" value={cfg.courts} />
                      <Stat label="Vote window" value={cfg.lock_mode === 'manual' ? 'Manual' : formatLockDuration(cfg.lock_seconds)} />
                      <Stat label="Pool chips" value={betChips} />
                    </div>
                    <RoundRail rounds={roundRows} activeRoundId={currentRound.id} />
                  </div>
                </Section>

                <Section title="Run controls">
                  <div className="grid grid-cols-2 gap-2">
                    <StateButton tournamentId={id} roundId={currentRound.id} state="open" label="Open ballot" disabled={!canOpenBallot} />
                    <StateButton tournamentId={id} roundId={currentRound.id} state="locked" label="Lock ballot" disabled={!canLockBallot} />
                    <form action={drawMixerRound}>
                      <input type="hidden" name="tournament_id" value={id} />
                      <input type="hidden" name="round_id" value={currentRound.id} />
                      <button disabled={!canDraw} className="w-full rounded-2xl px-4 py-3 text-sm font-semibold disabled:opacity-40" style={{ background: 'var(--court)', color: 'oklch(0.2 0.04 140)' }}>
                        Draw & reveal
                      </button>
                    </form>
                    <StateButton tournamentId={id} roundId={currentRound.id} state="playing" label="Start play" disabled={!canStartPlay} />
                    <StateButton tournamentId={id} roundId={currentRound.id} state="done" label={currentCourtCount > 0 && scoredCourtCount < currentCourtCount ? `Score ${currentCourtCount - scoredCourtCount} court${currentCourtCount - scoredCourtCount === 1 ? '' : 's'}` : 'Mark done'} disabled={!canMarkDone} />
                  </div>
                  <div className="mt-2 rounded-2xl bg-white p-3 text-xs leading-5 text-ink-3" style={{ border: '1px solid var(--line)' }}>
                    Players vote for every configured round up front. Lock ballot seals all unfinished rounds; each draw then reveals the next unfinished round in order.
                  </div>
                  <form action={finalizeMixerEvent} className="mt-2">
                    <input type="hidden" name="tournament_id" value={id} />
                    <button className="w-full rounded-2xl px-4 py-3 text-sm font-semibold" style={{ background: 'var(--ink)', color: 'var(--paper)' }}>
                      Finalize standings, raffle, and pools
                    </button>
                  </form>
                </Section>

                <Section title="Live surfaces">
                  <div className="grid grid-cols-2 gap-2">
                    <AdminLink href={`/tournaments/${id}/mixer`} title="Player mode" sub="Vote, match, pool, and me" />
                    <AdminLink href={`/tournaments/${id}/mixer/present`} title="Present" sub="Reveal and raffle board" />
                    <AdminLink href={`/tournaments/${id}/mixer/present/between`} title="Between-rounds board" sub="Projector standings & check-in" />
                    <AdminLink href={`/tournaments/${id}/mixer/score`} title="Score entry" sub="Post scores, watch standings rise" />
                  </div>
                </Section>
              </>
            )}

            {activeTab === 'roster' && (
              <>
                <Section title="Invite players">
                  <ShareCodeCard
                    inviteCode={formatInviteCode(t.invite_code)}
                    rawInviteCode={t.invite_code}
                    tournamentId={t.id}
                    tournamentName={t.name}
                  />
                  <Link
                    href={`/tournaments/${id}/invite`}
                    className="block rounded-2xl bg-white px-4 py-3 text-center text-sm font-bold text-ink"
                    style={{ border: '1px solid var(--line)' }}
                  >
                    Manage roster and personal invites
                  </Link>
                </Section>

                <Section title="Roster health">
                  <div className="grid gap-2">
                    {roster.map((p) => {
                      const state = stateRows.find((s) => s.player_id === p.id);
                      const pool = state?.pairing_pool ?? (p.gender === 'f' ? 'b' : 'a');
                      return (
                        <div key={p.id} className="rounded-xl bg-white p-3 text-sm" style={{ border: '1px solid var(--line)' }}>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="font-semibold text-ink">{p.display_name}</div>
                              <div className="mt-1 text-xs text-ink-3">
                                {p.profile_id ? 'linked' : 'anonymous'} · gender {p.gender ?? 'unset'} · sit-outs {state?.sit_out_count ?? 0}
                              </div>
                            </div>
                            <Chip tone={pool === 'a' ? 'court' : 'ghost'}>Pool {pool.toUpperCase()}</Chip>
                          </div>
                          <form action={updateMixerPlayerPool} className="mt-3 flex items-center gap-2">
                            <input type="hidden" name="tournament_id" value={id} />
                            <input type="hidden" name="player_id" value={p.id} />
                            <select name="pairing_pool" defaultValue={pool} className="h-10 flex-1 rounded-xl bg-paper-2 px-3 text-sm font-semibold text-ink">
                              <option value="a">Pool A</option>
                              <option value="b">Pool B</option>
                            </select>
                            <button className="h-10 rounded-xl px-3 text-xs font-bold" style={{ background: 'var(--ink)', color: 'var(--paper)' }}>Save</button>
                          </form>
                        </div>
                      );
                    })}
                  </div>
                </Section>

                <Section title="Payments">
                  {paymentRows.length === 0 ? (
                    <div className="rounded-2xl bg-white p-4 text-sm text-ink-3" style={{ border: '1px dashed var(--line)' }}>No payment records yet.</div>
                  ) : (
                    <div className="grid gap-2">
                      {paymentRows.map((p) => (
                        <div key={p.id} className="rounded-xl bg-white p-3 text-sm" style={{ border: '1px solid var(--line)' }}>
                          <div className="flex justify-between">
                            <span className="font-semibold text-ink">{name(p.player_id!)}</span>
                            <span className="mono text-ink">${p.amount}</span>
                          </div>
                          <div className="mt-1 text-xs text-ink-3">{p.type} · {p.method} · {p.status}</div>
                          {p.status === 'pending' && (
                            <div className="mt-3 flex gap-2">
                              <PaymentButton tournamentId={id} paymentId={p.id} status="confirmed" label="Confirm" />
                              <PaymentButton tournamentId={id} paymentId={p.id} status="refunded" label="Refund" />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </Section>
              </>
            )}

            {activeTab === 'scores' && (
              <Section title="Courts and scores">
                {pairingRows.length === 0 ? (
                  <div className="rounded-2xl bg-white p-4 text-center text-sm text-ink-3" style={{ border: '1px dashed var(--line)' }}>
                    No pairings revealed yet.
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {[...new Set(pairingRows.map((p) => p.court_no))].map((courtNo) => {
                      const teams = pairingRows.filter((p) => p.court_no === courtNo);
                      const score = scoreRows.find((s) => s.court_no === courtNo);
                      return (
                        <div key={courtNo} className="rounded-2xl bg-white p-4" style={{ border: '1px solid var(--line)' }}>
                          <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.06em] text-ink-3">Court {courtNo}</div>
                          <div className="grid gap-1 text-sm font-semibold text-ink">
                            {teams.map((team, idx) => (
                              <div key={team.id}>{idx === 0 ? 'A' : 'B'} · {name(team.player_a_id)} & {name(team.player_b_id)}</div>
                            ))}
                          </div>
                          <form action={scoreMixerCourt} className="mt-3 flex items-center gap-2">
                            <input type="hidden" name="tournament_id" value={id} />
                            <input type="hidden" name="round_id" value={currentRound.id} />
                            <input type="hidden" name="court_no" value={courtNo} />
                            <input name="team_a_score" type="number" min={0} defaultValue={score?.team_a_score ?? 0} className="mono h-10 w-16 rounded-xl bg-paper-2 text-center text-ink" />
                            <span className="text-xs text-ink-3">to</span>
                            <input name="team_b_score" type="number" min={0} defaultValue={score?.team_b_score ?? 0} className="mono h-10 w-16 rounded-xl bg-paper-2 text-center text-ink" />
                            <button className="ml-auto rounded-xl px-3 py-2 text-xs font-semibold" style={{ background: 'var(--ink)', color: 'var(--paper)' }}>Post</button>
                          </form>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Section>
            )}

            {activeTab === 'prizes' && (
              <Section title="Money and prizes">
                <div className="grid grid-cols-2 gap-2">
                  <Stat label="Paid entries" value={`${paidCount}/${roster.length}`} />
                  <Stat label="Pending" value={pendingPayments} />
                  <Stat label="Entry pot" value={`$${Math.round(paidCount * Number(cfg.entry_fee))}`} />
                  <Stat label="Pool chips" value={betChips} />
                </div>
                <div className="mt-3 grid gap-2">
                  <PrizeBucket label="Tournament" pct={prizeBuckets.tournament} amount={roster.length * Number(cfg.entry_fee) * prizeBuckets.tournament} />
                  <PrizeBucket label="Raffle" pct={prizeBuckets.raffle} amount={roster.length * Number(cfg.entry_fee) * prizeBuckets.raffle} />
                  <PrizeBucket label="Betting" pct={prizeBuckets.betting} amount={roster.length * Number(cfg.entry_fee) * prizeBuckets.betting} />
                  <PrizeBucket label="Reserve" pct={prizeBuckets.reserve} amount={roster.length * Number(cfg.entry_fee) * prizeBuckets.reserve} />
                </div>
                {finalStandings.length > 0 && (
                  <div className="mt-3 rounded-2xl bg-white p-4" style={{ border: '1px solid var(--line)' }}>
                    <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-3">Finalized</div>
                    <div className="mt-1 text-sm font-semibold text-ink">Snapshot is ready for presentation.</div>
                    <div className="mt-1 text-xs text-ink-3">Raffle winner: {String(raffleWinner?.displayName ?? 'not drawn')}</div>
                  </div>
                )}
              </Section>
            )}

            {activeTab === 'setup' && (
              <Section title="Event setup">
                <ConfigForm tournamentId={id} cfg={cfg} prizeBuckets={prizeBuckets} paymentMethods={paymentMethods} playerCount={roster.length} betChips={betChips} />
              </Section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
