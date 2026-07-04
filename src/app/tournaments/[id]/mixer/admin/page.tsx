import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { formatInviteCode } from '@/lib/invite-codes';
import { Chip } from '@/components/ui/Chip';
import { DesktopSurface, BallMark } from '@/components/desktop';
import { currentMixerRound, sortMixerRounds } from '@/lib/mixer-rounds';
import { THEME_COOKIE, readThemeFromCookie } from '@/lib/theme';
import { ShareCodeCard } from '../../invite/ShareCodeCard';
import { MixerRealtimeSync } from '../MixerRealtimeSync';
import { ConfirmForm } from '@/components/ui/ConfirmForm';
import {
  drawMixerRound,
  finalizeMixerEvent,
  initializeMixerEvent,
  reopenMixerRound,
  resetMixerEvent,
  resetMixerRoundVotes,
  scoreMixerCourt,
  setMixerVotingWindow,
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
} from '../_components/admin-helpers';
import { normalizePaymentMethods } from '../_components/payment-methods';
import {
  Notice,
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

  const [{ data: pairings }, { data: scores }, { data: payments }, { data: states }, { data: betsSummary }, { data: snapshot }, { data: voteRows }] = await Promise.all([
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
    // Blind-safe participation: only which players have voted this round —
    // never who they voted for. Distinct voter_player_id → the ballot ring.
    currentRound
      ? supabase.from('mixer_votes').select('voter_player_id').eq('round_id', currentRound.id)
      : Promise.resolve({ data: [] }),
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

  // Ballot participation (blind — who has voted, never who for) for the ring.
  const voterSet = new Set(((voteRows ?? []) as { voter_player_id: string }[]).map((v) => v.voter_player_id));
  const votedNames = roster.filter((p) => voterSet.has(p.id)).map((p) => p.display_name);
  const votedCount = votedNames.length;
  // Armed-draw weights derived from the tuned formula knobs (alpha/beta/gamma).
  const wSum = Number(cfg?.alpha ?? 0) + Number(cfg?.beta ?? 0) + Number(cfg?.gamma ?? 0);
  const wPct = (w: number | undefined) => (wSum > 0 ? Math.round((Number(w ?? 0) / wSum) * 100) : 0);
  const anonCount = roster.filter((p) => !p.profile_id).length;
  const entryFee = Number(cfg?.entry_fee ?? 0);
  const stepIndex = ((s: string | undefined) => {
    switch (s) {
      case 'open':
        return 1;
      case 'locked':
        return 2;
      case 'drawing':
        return 3;
      case 'revealed':
        return 4;
      case 'playing':
        return 4;
      case 'done':
        return 5;
      default:
        return 0;
    }
  })(currentRound?.state);

  const cookieStore = await cookies();
  const theme = readThemeFromCookie(cookieStore.get(THEME_COOKIE)?.value);

  return (
    // Surface tint follows the chosen theme so the cockpit reads as ONE app
    // edge to edge (previously a hardcoded night body framed light content).
    <DesktopSurface variant={theme === 'night' ? 'night' : 'default'} withCommandBar>
      <MixerRealtimeSync tournamentId={id} />
      <div className="mx-auto grid w-full max-w-[1440px] grid-cols-1 lg:grid-cols-[248px_minmax(0,1fr)]">
        <CockpitSidebar
          tournamentId={id}
          eventName={t.name}
          state={currentRound?.state ?? null}
          roundNo={currentRound?.round_no ?? null}
          roundsTotal={cfg?.rounds ?? null}
          playerCount={roster.length}
          active={activeTab}
          pendingPayments={pendingPayments}
        />
        <div className="min-w-0">
          <CockpitTopbar
            title={COCKPIT_TITLES[activeTab] ?? 'Cockpit'}
            sub={cockpitSub(activeTab, currentRound?.round_no ?? null, currentRound?.state ?? null, roster.length, paidCount, pendingPayments)}
          />
          <div id="main" className="px-5 pb-24 pt-6 lg:px-7">
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
            {activeTab === 'run' && (
              <>
                <CockpitStateBar stepIndex={stepIndex} roundNo={currentRound.round_no} roundsTotal={cfg.rounds} />

                <div className="grid gap-[18px] xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
                  {/* LEFT — mission control */}
                  <div className="flex flex-col gap-[18px]">
                    {/* Ballot status */}
                    <div
                      className="rounded-[18px] p-5"
                      style={{
                        background: 'linear-gradient(150deg, color-mix(in oklch, var(--accent) 22%, var(--surface-card)), var(--surface-inset) 70%)',
                        border: '1px solid color-mix(in oklch, var(--accent) 26%, var(--line))',
                      }}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Ballot status</h3>
                          <div className="text-[12.5px]" style={{ color: 'var(--text3)' }}>
                            {cfg.lock_mode === 'manual' ? 'Manual lock · all rounds lock together' : `Timer lock · ${formatLockDuration(cfg.lock_seconds)} window`}
                          </div>
                          <div className="mono mt-3 text-[54px] font-bold leading-none tracking-[-.03em]" style={{ color: 'var(--text)' }}>
                            {votedCount}
                            <span className="text-[20px]" style={{ color: 'var(--text3)' }}> / {roster.length}</span>
                          </div>
                          <div className="mono text-[11px] uppercase tracking-[.1em]" style={{ color: 'var(--text3)' }}>ballots in</div>
                        </div>
                        <Ring pct={roster.length ? Math.round((votedCount / roster.length) * 100) : 0} label={`${votedCount}/${roster.length}`} />
                      </div>
                      <div className="mt-4 flex items-center gap-2.5">
                        <Facepile names={votedNames} />
                        <div className="text-[13.5px]" style={{ color: 'var(--text2)' }}>
                          <b style={{ color: 'var(--text)' }}>{votedCount} of {roster.length}</b> players have voted
                        </div>
                      </div>
                      <BlindNote />
                      <div className="mt-4 grid grid-cols-2 gap-2.5">
                        <StateButton tournamentId={id} roundId={currentRound.id} state="open" label="Open ballot" disabled={!canOpenBallot} />
                        <StateButton tournamentId={id} roundId={currentRound.id} state="locked" label="Lock all ballots" disabled={!canLockBallot} />
                      </div>
                      {/* Voting window in HOURS — sets config.lock_seconds and
                          re-arms this round's timer in one tap. */}
                      <form action={setMixerVotingWindow} className="mt-2.5 flex items-center gap-2">
                        <input type="hidden" name="tournament_id" value={id} />
                        <input type="hidden" name="round_id" value={currentRound.id} />
                        <label className="flex flex-1 items-center gap-2 rounded-xl px-3 py-2" style={{ background: 'var(--surface-inset)', border: '1px solid var(--line)' }}>
                          <span className="mono text-[10.5px] uppercase tracking-[0.08em]" style={{ color: 'var(--text3)' }}>Voting window</span>
                          <input
                            name="lock_hours"
                            type="number"
                            min={1}
                            max={168}
                            defaultValue={Math.max(1, Math.round(cfg.lock_seconds / 3600))}
                            className="w-16 bg-transparent text-right text-[15px] font-bold outline-none"
                            style={{ color: 'var(--text)' }}
                          />
                          <span className="text-[12px]" style={{ color: 'var(--text3)' }}>hours</span>
                        </label>
                        <button className="rounded-xl px-4 py-2.5 text-[13px] font-semibold" style={{ background: 'var(--surface-raise)', color: 'var(--text)', border: '1px solid var(--line-2)' }}>
                          Start timer
                        </button>
                      </form>
                    </div>

                    {/* The draw */}
                    <div className="rounded-[18px] p-5" style={PANEL}>
                      <h3 className="flex items-center gap-2 text-[15px] font-semibold" style={{ color: 'var(--text)' }}>
                        The draw
                        <span className="chip">{canDraw ? 'Armed' : 'Armed after lock'}</span>
                      </h3>
                      <div className="mb-3.5 text-[12.5px]" style={{ color: 'var(--text3)' }}>
                        Weighted by your Setup — the reveal plays on the present screen and every phone at once.
                      </div>
                      <div className="mb-3.5 flex gap-2">
                        <WeightTile v={`${wPct(cfg.alpha)}%`} l="Votes" />
                        <WeightTile v={`${wPct(cfg.beta)}%`} l="Skill balance" />
                        <WeightTile v={`${wPct(cfg.gamma)}%`} l="Novelty" />
                      </div>
                      <form action={drawMixerRound}>
                        <input type="hidden" name="tournament_id" value={id} />
                        <input type="hidden" name="round_id" value={currentRound.id} />
                        <button
                          disabled={!canDraw}
                          className="w-full rounded-2xl px-4 py-4 text-[16px] font-semibold disabled:cursor-not-allowed disabled:opacity-45"
                          style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
                        >
                          🎲 Run the draw
                        </button>
                      </form>
                    </div>

                    {/* Round controls */}
                    <div className="rounded-[18px] p-5" style={PANEL}>
                      <h3 className="text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Round controls</h3>
                      <div className="mb-3 text-[12.5px]" style={{ color: 'var(--text3)' }}>
                        Each draw reveals the next unfinished round in order; ballots for every round lock together.
                      </div>
                      <div className="grid grid-cols-2 gap-2.5">
                        <StateButton tournamentId={id} roundId={currentRound.id} state="playing" label="Start play" disabled={!canStartPlay} />
                        <StateButton
                          tournamentId={id}
                          roundId={currentRound.id}
                          state="done"
                          label={currentCourtCount > 0 && scoredCourtCount < currentCourtCount ? `Score ${currentCourtCount - scoredCourtCount} court${currentCourtCount - scoredCourtCount === 1 ? '' : 's'}` : 'Mark done'}
                          disabled={!canMarkDone}
                        />
                      </div>
                      <form action={finalizeMixerEvent} className="mt-2.5">
                        <input type="hidden" name="tournament_id" value={id} />
                        <button
                          className="w-full rounded-2xl px-4 py-3 text-sm font-semibold"
                          style={{ background: 'var(--surface-raise)', color: 'var(--text)', border: '1px solid var(--line-2)' }}
                        >
                          Finalize standings, raffle &amp; pools
                        </button>
                      </form>
                      <div className="mt-3">
                        <RoundRail rounds={roundRows} activeRoundId={currentRound.id} />
                      </div>
                    </div>
                  </div>

                  {/* RIGHT — live read-outs */}
                  <div className="flex flex-col gap-[18px]">
                    {/* Recovery controls — mistakes happen on live nights. */}
                    <div className="rounded-[18px] p-5" style={{ border: '1px solid color-mix(in oklch, var(--berry, oklch(0.55 0.2 12)) 35%, var(--line))', background: 'var(--surface-card)' }}>
                      <h3 className="text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Rerun &amp; reset</h3>
                      <div className="mb-3 text-[12.5px]" style={{ color: 'var(--text3)' }}>
                        Fix a draw that fired early or start the night over. Roster and payments always survive.
                      </div>
                      <div className="grid gap-2">
                        <ConfirmForm action={reopenMixerRound} confirm={`Reopen round ${currentRound.round_no}? Its pairings are cleared and voting goes live again.`}>
                          <input type="hidden" name="tournament_id" value={id} />
                          <input type="hidden" name="round_id" value={currentRound.id} />
                          <button className="w-full rounded-xl px-4 py-2.5 text-[13px] font-semibold" style={{ background: 'var(--surface-raise)', color: 'var(--text)', border: '1px solid var(--line-2)' }}>
                            Reopen round {currentRound.round_no} (clear draw)
                          </button>
                        </ConfirmForm>
                        <ConfirmForm action={resetMixerRoundVotes} confirm={`Wipe every ballot for round ${currentRound.round_no} and refund the tokens?`}>
                          <input type="hidden" name="tournament_id" value={id} />
                          <input type="hidden" name="round_id" value={currentRound.id} />
                          <button className="w-full rounded-xl px-4 py-2.5 text-[13px] font-semibold" style={{ background: 'var(--surface-raise)', color: 'var(--text)', border: '1px solid var(--line-2)' }}>
                            Reset round {currentRound.round_no} votes (refund tokens)
                          </button>
                        </ConfirmForm>
                        <ConfirmForm action={resetMixerEvent} confirm="Reset the ENTIRE event? All pairings, scores, ballots, and bets are wiped; tokens and chips are restored; every round reopens. Roster and payments are kept.">
                          <input type="hidden" name="tournament_id" value={id} />
                          <button className="w-full rounded-xl px-4 py-2.5 text-[13px] font-bold" style={{ background: 'color-mix(in oklch, oklch(0.55 0.2 12) 14%, var(--surface-card))', color: 'oklch(0.55 0.2 12)', border: '1px solid color-mix(in oklch, oklch(0.55 0.2 12) 45%, var(--line))' }}>
                            Reset whole event &amp; rerun
                          </button>
                        </ConfirmForm>
                      </div>
                    </div>
                    <div className="rounded-[18px] p-5" style={PANEL}>
                      <h3 className="flex items-center gap-2 text-[15px] font-semibold" style={{ color: 'var(--text)' }}>
                        Live courts
                        {currentCourtCount > 0 && <span className="chip chip-live"><span className="dot" />R{currentRound.round_no}</span>}
                      </h3>
                      {currentCourtCount === 0 ? (
                        <div className="mt-2 text-[13px]" style={{ color: 'var(--text3)' }}>No courts revealed yet — run the draw to seat this round.</div>
                      ) : (
                        <div className="mt-3 flex flex-col gap-2">
                          {[...new Set(pairingRows.map((p) => p.court_no))].map((courtNo) => {
                            const teams = pairingRows.filter((p) => p.court_no === courtNo);
                            const score = scoreRows.find((s) => s.court_no === courtNo);
                            const live = !!score && !score.completed_at;
                            return (
                              <CourtMini
                                key={courtNo}
                                courtNo={courtNo}
                                teamA={teams[0] ? `${name(teams[0].player_a_id)} & ${name(teams[0].player_b_id)}` : '—'}
                                teamB={teams[1] ? `${name(teams[1].player_a_id)} & ${name(teams[1].player_b_id)}` : '—'}
                                scoreA={score?.team_a_score ?? 0}
                                scoreB={score?.team_b_score ?? 0}
                                live={live}
                              />
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div className="rounded-[18px] p-5" style={PANEL}>
                      <h3 className="text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Roster health</h3>
                      <div className="mt-2">
                        <MiniStat label="Confirmed & paid" value={paidCount} tone="accent" />
                        <MiniStat label="Payment pending" value={pendingPayments} tone="serve" />
                        <MiniStat label="Anonymous joins" value={anonCount} />
                        <MiniStat label="Fees collected" value={`$${Math.round(paidCount * entryFee)} / ${Math.round(roster.length * entryFee)}`} />
                      </div>
                    </div>

                    <div className="rounded-[18px] p-5" style={PANEL}>
                      <h3 className="text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Pool &amp; raffle</h3>
                      <div className="mt-2">
                        <MiniStat label="Betting pool chips" value={betChips} />
                        <MiniStat label="Prize" value={cfg.raffle_prize || 'Not set'} text />
                      </div>
                    </div>

                    <div className="rounded-[18px] p-5" style={PANEL}>
                      <h3 className="text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Live surfaces</h3>
                      <div className="mt-3 grid gap-2">
                        <SurfaceLink href={`/tournaments/${id}/mixer/present`} title="Present" sub="Reveal & raffle board" />
                        <SurfaceLink href={`/tournaments/${id}/mixer/present/between`} title="Between-rounds board" sub="Standings & check-in" />
                        <SurfaceLink href={`/tournaments/${id}/mixer/score`} title="Score entry" sub="Post scores courtside" />
                        <SurfaceLink href={`/tournaments/${id}/mixer/recovery`} title="Roster recovery" sub="Odd count, no-shows" />
                        <SurfaceLink href={`/tournaments/${id}/recap`} title="Recap & export" sub="Podium, CSV & share" />
                        <SurfaceLink href={`/tournaments/${id}/mixer`} title="Player mode" sub="See it as a player" />
                      </div>
                    </div>
                  </div>
                </div>
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
      </div>
    </DesktopSurface>
  );
}

// ---------------------------------------------------------------------------
// Desktop night cockpit chrome (handoff admin.html): 248px sidebar + topbar,
// mission-control Run pane primitives. Blind-vote guardrail: participation
// only — the ring and facepile show who has voted, never who they voted for.
// ---------------------------------------------------------------------------

const PANEL: React.CSSProperties = { background: 'var(--card)', border: '1px solid var(--line)' };

const COCKPIT_TITLES: Record<string, string> = {
  run: 'Run event',
  roster: 'Roster',
  scores: 'Scores',
  prizes: 'Prizes',
  setup: 'Setup',
};

function cockpitSub(
  tab: string,
  roundNo: number | null,
  state: string | null,
  players: number,
  paid: number,
  pending: number,
): string {
  switch (tab) {
    case 'run':
      return roundNo ? `Round ${roundNo} · ${state ?? 'setup'}` : 'Set up the event to begin';
    case 'roster':
      return `${players} players · ${paid} paid · ${pending} pending`;
    case 'scores':
      return 'Post scores court by court · game to 11, win by 2';
    case 'prizes':
      return 'Entry pot, raffle & pooled betting';
    case 'setup':
      return 'Tokens, lock mode, draw weighting & payments';
    default:
      return '';
  }
}

const NAV_ITEMS: { tab: string; label: string; icon: React.ReactNode }[] = [
  { tab: 'run', label: 'Run event', icon: <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /> },
  { tab: 'roster', label: 'Roster', icon: <path d="M9 8a3 3 0 106 0 3 3 0 00-6 0zM4 19c.8-3 2.8-4.4 5-4.4s4.2 1.4 5 4.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /> },
  { tab: 'scores', label: 'Scores', icon: <><rect x="4" y="4" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="1.6" /><path d="M8 9h8M8 13h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></> },
  { tab: 'prizes', label: 'Prizes', icon: <path d="M7 4h10v3a5 5 0 01-10 0V4zM9 15h6M8 20h8M12 15v5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /> },
  { tab: 'setup', label: 'Setup', icon: <><circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.5" /><path d="M12 3.5v2M12 18.5v2M4.5 7l1.7 1M17.8 16l1.7 1M4.5 17l1.7-1M17.8 8l1.7-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></> },
];

function CockpitSidebar({
  tournamentId,
  eventName,
  state,
  roundNo,
  roundsTotal,
  playerCount,
  active,
  pendingPayments,
}: {
  tournamentId: string;
  eventName: string;
  state: string | null;
  roundNo: number | null;
  roundsTotal: number | null;
  playerCount: number;
  active: string;
  pendingPayments: number;
}) {
  const live = state === 'open' || state === 'playing';
  return (
    <aside
      className="flex flex-col gap-1.5 border-b p-4 lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r"
      style={{ background: 'var(--surface-nav)', borderColor: 'var(--line)' }}
    >
      <div className="flex items-center gap-2.5 px-2 pb-4 pt-1.5" style={{ color: 'var(--text)' }}>
        <BallMark size={26} />
        <span className="serif text-[20px]">Try to Dink</span>
        <span className="mono ml-auto rounded-md px-2 py-[3px] text-[10px] font-bold text-white" style={{ background: 'oklch(0.55 0.2 25)' }}>
          ★ 250
        </span>
      </div>
      <div className="mb-2 rounded-xl px-3 py-2.5" style={{ background: 'var(--surface-raise)', border: '1px solid var(--line)' }}>
        <div className="flex items-center gap-2 text-[14px] font-semibold" style={{ color: 'var(--text)' }}>
          <span className={live ? 'chip chip-live' : 'chip'} style={{ padding: '2px 7px' }}>
            {live ? <span className="dot" /> : null}
            {live ? 'Live' : (state ?? 'setup')}
          </span>
          <span className="truncate">{eventName}</span>
        </div>
        <div className="mono mt-1 text-[10.5px] tracking-[.06em]" style={{ color: 'var(--text3)' }}>
          {playerCount} PLAYERS{roundNo && roundsTotal ? ` · ROUND ${roundNo}/${roundsTotal}` : ''}
        </div>
      </div>
      <div className="mono px-2.5 pb-1.5 pt-2 text-[10px] uppercase tracking-[.14em]" style={{ color: 'var(--text3)' }}>Cockpit</div>
      {NAV_ITEMS.map((item) => {
        const on = active === item.tab;
        return (
          <Link
            key={item.tab}
            href={`/tournaments/${tournamentId}/mixer/admin?tab=${item.tab}`}
            className="flex items-center gap-3 rounded-[11px] border px-3 py-2.5 text-[14px] font-medium"
            style={
              on
                ? { background: 'color-mix(in oklch, var(--accent) 16%, transparent)', color: 'var(--text)', borderColor: 'color-mix(in oklch, var(--accent) 34%, transparent)' }
                : { color: 'var(--text2)', borderColor: 'transparent' }
            }
          >
            <span className="grid w-5 place-items-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                {item.icon}
              </svg>
            </span>
            {item.label}
            {item.tab === 'prizes' && pendingPayments > 0 ? (
              <span className="mono ml-auto rounded-full px-[7px] py-px text-[10px] font-bold text-white" style={{ background: 'var(--serve)' }}>
                {pendingPayments}
              </span>
            ) : null}
          </Link>
        );
      })}
      <div className="hidden flex-1 lg:block" />
      <div className="mono px-2.5 pb-1.5 pt-2 text-[10px] uppercase tracking-[.14em]" style={{ color: 'var(--text3)' }}>Viewing as</div>
      <div className="flex gap-1 rounded-[11px] p-[3px]" style={{ background: 'var(--surface-raise)', border: '1px solid var(--line)' }}>
        <Link href={`/tournaments/${tournamentId}/mixer`} className="flex-1 rounded-lg py-2 text-center text-[12.5px] font-semibold" style={{ color: 'var(--text3)' }}>
          Player
        </Link>
        <span className="flex-1 rounded-lg py-2 text-center text-[12.5px] font-semibold" style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}>
          Admin
        </span>
      </div>
      <Link
        href={`/tournaments/${tournamentId}/mixer/present`}
        className="mt-2 flex items-center justify-center gap-2 rounded-[11px] py-2.5 text-[13px] font-semibold"
        style={{ background: 'var(--surface-raise)', color: 'var(--text)', border: '1px solid var(--line-2)' }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="3" y="4" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="1.7" />
          <path d="M8 20h8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
        Open present screen
      </Link>
    </aside>
  );
}

function CockpitTopbar({ title, sub }: { title: string; sub: string }) {
  return (
    <div
      className="sticky top-0 z-20 flex h-[66px] items-center gap-4 border-b px-5 lg:px-7"
      style={{ background: 'color-mix(in oklch, var(--bg) 82%, transparent)', backdropFilter: 'blur(10px)', borderColor: 'var(--line)' }}
    >
      <div
        className="absolute inset-x-0 top-0 h-[3px]"
        style={{ background: 'linear-gradient(90deg, oklch(0.55 0.2 25) 0 40%, #fff 40% 60%, oklch(0.42 0.14 258) 60%)' }}
      />
      <div>
        <h1 className="text-[19px] font-semibold" style={{ color: 'var(--text)' }}>{title}</h1>
        <div className="mono text-[11px] tracking-[.06em]" style={{ color: 'var(--text3)' }}>{sub}</div>
      </div>
    </div>
  );
}

function CockpitStateBar({ stepIndex, roundNo, roundsTotal }: { stepIndex: number; roundNo: number; roundsTotal: number }) {
  const steps = ['Open', 'Voting', 'Lock', 'Draw', 'Live', 'Scored'];
  return (
    <div
      className="mb-5 flex flex-wrap items-center gap-2.5 rounded-2xl p-3.5"
      style={{ background: 'var(--surface-card)', border: '1px solid var(--line)' }}
    >
      {steps.map((label, i) => {
        const done = i < stepIndex;
        const cur = i === stepIndex;
        return (
          <div key={label} className="flex items-center gap-2.5">
            <div
              className="flex items-center gap-2 rounded-[10px] px-3 py-1.5 text-[13px] font-semibold"
              style={
                cur
                  ? { background: 'color-mix(in oklch, var(--serve) 14%, transparent)', color: 'var(--text)' }
                  : { color: done ? 'var(--text2)' : 'var(--text3)' }
              }
            >
              <span
                className="mono grid h-5 w-5 place-items-center rounded-full text-[10px]"
                style={
                  done
                    ? { background: 'var(--accent)', color: 'var(--accent-ink)' }
                    : cur
                      ? { background: 'var(--serve)', color: '#fff' }
                      : { border: '1.5px solid var(--line-2)' }
                }
              >
                {i + 1}
              </span>
              {label}
            </div>
            {i < steps.length - 1 ? <span style={{ color: 'var(--text3)' }}>→</span> : null}
          </div>
        );
      })}
      <span className="chip chip-live ml-auto"><span className="dot" />Round {roundNo} of {roundsTotal}</span>
    </div>
  );
}

function Ring({ pct, label }: { pct: number; label: string }) {
  return (
    <div
      className="relative grid h-24 w-24 shrink-0 place-items-center rounded-full"
      style={{ background: `conic-gradient(var(--accent) ${pct}%, var(--line-2) 0)` }}
    >
      <div className="absolute rounded-full" style={{ inset: 9, background: 'var(--surface-inset)' }} />
      <span className="mono relative text-[18px] font-bold" style={{ color: 'var(--text)' }}>{label}</span>
    </div>
  );
}

function initialsOf(name: string) {
  return name.split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

function Facepile({ names }: { names: string[] }) {
  const shown = names.slice(0, 5);
  const extra = names.length - shown.length;
  return (
    <div className="flex">
      {shown.map((n, i) => (
        <span
          key={n + i}
          className="av"
          style={{ width: 32, height: 32, marginLeft: i === 0 ? 0 : -10, fontSize: 11, color: 'var(--accent-ink)', background: 'var(--accent)', border: '2px solid var(--surface-card)' }}
          aria-hidden
        >
          {initialsOf(n)}
        </span>
      ))}
      {extra > 0 ? (
        <span
          className="mono grid place-items-center rounded-full text-[11px] font-bold"
          style={{ width: 32, height: 32, marginLeft: -10, background: 'var(--surface-raise)', border: '2px solid var(--surface-card)', color: 'var(--text2)' }}
        >
          +{extra}
        </span>
      ) : null}
    </div>
  );
}

function BlindNote() {
  return (
    <div
      className="mt-3.5 flex items-center gap-2 rounded-[10px] border border-dashed px-3 py-2.5 text-[12px]"
      style={{ background: 'var(--surface-inset)', borderColor: 'var(--line-2)', color: 'var(--text3)' }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M4 4l16 16M6.2 6.7C3.9 8.2 2.5 12 2.5 12s3.5 6.5 9.5 6.5c1.6 0 3-.45 4.2-1.1M10 5.8c.65-.13 1.3-.2 2-.2 6 0 9.5 6.4 9.5 6.4a17 17 0 01-2.3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      Blind ballot — even you can&apos;t see picks or tallies until the draw.
    </div>
  );
}

function WeightTile({ v, l }: { v: string; l: string }) {
  return (
    <div className="flex-1 rounded-xl p-2.5 text-center" style={{ background: 'var(--surface-inset)', border: '1px solid var(--line)' }}>
      <div className="mono text-[19px] font-bold" style={{ color: 'var(--accent)' }}>{v}</div>
      <div className="mono mt-0.5 text-[9.5px] uppercase tracking-[.1em]" style={{ color: 'var(--text3)' }}>{l}</div>
    </div>
  );
}

function CourtMini({ courtNo, teamA, teamB, scoreA, scoreB, live }: { courtNo: number; teamA: string; teamB: string; scoreA: number; scoreB: number; live: boolean }) {
  return (
    <div
      className="flex items-center gap-3 rounded-xl p-3"
      style={{ border: '1px solid var(--line)', borderLeft: live ? '3px solid var(--serve)' : '1px solid var(--line)' }}
    >
      <span className="mono w-12 text-[11px]" style={{ color: 'var(--text3)' }}>CT {courtNo}</span>
      <div className="min-w-0 flex-1 text-[13px]" style={{ color: 'var(--text)' }}>
        <div className="flex justify-between gap-2"><span className="truncate">{teamA}</span><span className="mono font-bold">{scoreA}</span></div>
        <div className="flex justify-between gap-2"><span className="truncate">{teamB}</span><span className="mono font-bold">{scoreB}</span></div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, tone, text }: { label: string; value: string | number; tone?: 'accent' | 'serve'; text?: boolean }) {
  const color = tone === 'accent' ? 'var(--accent)' : tone === 'serve' ? 'var(--serve)' : 'var(--text)';
  return (
    <div className="flex items-center justify-between border-b py-2.5 last:border-b-0" style={{ borderColor: 'var(--line)' }}>
      <span className="text-[13px]" style={{ color: 'var(--text2)' }}>{label}</span>
      <span className={text ? 'text-[13px] font-semibold' : 'mono text-[15px] font-bold'} style={{ color }}>{value}</span>
    </div>
  );
}

function SurfaceLink({ href, title, sub }: { href: string; title: string; sub: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-2 rounded-xl px-3.5 py-2.5"
      style={{ background: 'var(--surface-inset)', border: '1px solid var(--line)' }}
    >
      <span className="min-w-0">
        <span className="block text-[13.5px] font-semibold" style={{ color: 'var(--text)' }}>{title}</span>
        <span className="block text-[11.5px]" style={{ color: 'var(--text3)' }}>{sub}</span>
      </span>
      <span style={{ color: 'var(--text3)' }}>›</span>
    </Link>
  );
}
