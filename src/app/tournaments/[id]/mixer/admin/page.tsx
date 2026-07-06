import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { DesktopSurface, BallMark } from '@/components/desktop';
import { currentMixerRound, sortMixerRounds } from '@/lib/mixer-rounds';
import { buildCourtResults, gameSlotLabel } from '@/lib/mixer-standings';
import { mixerTeamPlan } from '@/lib/mixer';
import { THEME_COOKIE, readThemeFromCookie } from '@/lib/theme';
import { MixerRealtimeSync } from '../MixerRealtimeSync';
import { ActionForm } from '../_components/ActionForm';
import { ConfirmForm } from '@/components/ui/ConfirmForm';
import { simulateRoundVotesAction, playRoundAction, autoNightAction, seedTestTournamentAction } from '../sim-actions';
import {
  finalizeMixerEvent,
  initializeMixerEvent,
  reopenMixerRound,
  repoolMixerRoster,
  swapMixerPlayer,
  resetMixerEvent,
  resetMixerRoundVotes,
  setMixerVotingWindow,
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
import { RosterTable, type RosterTableRow } from '../_components/RosterTable';
import { mixerAvatarFor } from '../_components/mixer-night';
import { CountdownTimer } from '../_components/CountdownTimer';
import { OrganizerRevealTakeover } from '../_components/OrganizerRevealTakeover';
import { DrawArmedModal } from '../_components/DrawArmedModal';
import { CockpitScoreBoard } from '../_components/CockpitScoreBoard';
import { StandingsBoard } from '../_components/StandingsBoard';
import { CockpitTabsProvider, CockpitPanel, CockpitNavList, CockpitTopbarTitle, type CockpitTab } from '../_components/cockpit-tabs';
import {
  formatLockDuration,
  getOrganizerTab,
  normalizePrizeBuckets,
} from '../_components/admin-helpers';
import { normalizePaymentMethods } from '../_components/payment-methods';
import {
  Notice,
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
    supabase.from('tournaments').select('id,name,format,owner_user_id,status,invite_code,gender_mode').eq('id', id).single(),
    user
      ? supabase.from('tournament_members').select('role').eq('tournament_id', id).eq('user_id', user.id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('event_config').select('*').eq('tournament_id', id).maybeSingle(),
    supabase.from('mixer_rounds').select('id,round_no,state,lock_at').eq('tournament_id', id).order('round_no', { ascending: true }),
    supabase.from('tournament_players').select('id,display_name,gender,profile_id,dupr,withdrawn_at').eq('tournament_id', id).order('created_at', { ascending: true }),
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

  // All game slots for the whole night — the Scores tab board (round tabs +
  // progress strip) spans every round, not just the current one. Computed up
  // front so it batches with everything else instead of a second serial round.
  const allRoundIds = roundRows.map((r) => r.id);
  const [{ data: pairings }, { data: scores }, { data: payments }, { data: states }, { data: betsSummary }, { data: snapshot }, { data: ballotRows }, { data: allPairings }, { data: allScores }] = await Promise.all([
    currentRound
      ? supabase.from('mixer_pairings').select('id,player_a_id,player_b_id,court_no,wave_no').eq('round_id', currentRound.id).order('court_no', { ascending: true }).order('wave_no', { ascending: true })
      : Promise.resolve({ data: [] }),
    currentRound
      ? supabase.from('mixer_scores').select('court_no,wave_no,team_a_score,team_b_score,completed_at').eq('round_id', currentRound.id)
      : Promise.resolve({ data: [] }),
    supabase.from('payments').select('id,player_id,type,amount,method,status').eq('tournament_id', id).order('created_at', { ascending: false }).limit(50),
    supabase.from('player_event_state').select('player_id,pairing_pool,tokens_base_remaining,tokens_bought_remaining,chips_remaining,sit_out_count').eq('tournament_id', id),
    // Aggregated server-side via app_mixer_bets_summary so admins never see
    // per-row (bettor_player_id, chips) — only market liquidity totals.
    supabase.rpc('app_mixer_bets_summary', { p_tournament_id: id }),
    supabase.from('mixer_final_snapshots').select('standings,raffle_tickets,raffle_winner,bet_settlements').eq('tournament_id', id).maybeSingle(),
    // Blind-safe participation: who has LOCKED IN their ballot this round (the
    // "I'm done" signal). mixer_round_ballots holds only (player, confirmed_at)
    // — never the picks — so it drives the ring without leaking the blind vote.
    // Realtime on this table (MixerRealtimeSync) makes the ring update live.
    currentRound
      ? supabase.from('mixer_round_ballots').select('player_id,confirmed_at').eq('round_id', currentRound.id)
      : Promise.resolve({ data: [] }),
    allRoundIds.length
      ? supabase.from('mixer_pairings').select('id,created_at,round_id,player_a_id,player_b_id,court_no,wave_no').in('round_id', allRoundIds)
      : Promise.resolve({ data: [] }),
    allRoundIds.length
      ? supabase.from('mixer_scores').select('round_id,court_no,wave_no,team_a_score,team_b_score,completed_at').in('round_id', allRoundIds)
      : Promise.resolve({ data: [] }),
  ]);

  const pairingRows = (pairings ?? []) as PairingRow[];
  const scoreRows = (scores ?? []) as ScoreRow[];
  const paymentRows = (payments ?? []) as PaymentRow[];
  const stateRows = (states ?? []) as StateRow[];
  const betSummaryRows = (betsSummary ?? []) as BetSummaryRow[];
  const final = snapshot as SnapshotRow | null;
  const name = (playerId: string) => roster.find((p) => p.id === playerId)?.display_name ?? 'TBD';
  const scoreResults = buildCourtResults(
    (allPairings ?? []) as { id?: string; created_at?: string | null; round_id: string; player_a_id: string; player_b_id: string; court_no: number; wave_no: number }[],
    (allScores ?? []) as { round_id: string; court_no: number; wave_no: number; team_a_score: number; team_b_score: number; completed_at: string | null }[],
    new Map(roundRows.map((r) => [r.id, r.round_no] as const)),
    currentRound?.id ?? null,
    name,
  );
  // Gender per player (by-gender podium) + finalized flag for the Standings tab.
  const genders: Record<string, PlayerRow['gender']> = {};
  for (const p of roster) genders[p.id] = p.gender;
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
  // A "game slot" is one matchup = (court, wave). When games outnumber courts a
  // court hosts several waves (heats), so the round's game count is the number
  // of distinct (court, wave) pairs, not distinct courts.
  const slotKey = (courtNo: number, waveNo: number) => `${courtNo}:${waveNo}`;
  const gameSlots = [...new Map(pairingRows.map((p) => [slotKey(p.court_no, p.wave_no), { courtNo: p.court_no, waveNo: p.wave_no }])).values()]
    .sort((a, b) => a.courtNo - b.courtNo || a.waveNo - b.waveNo);
  const currentCourtCount = gameSlots.length;
  // Organizer cockpit draw reveal (once per round): the courts the tokens seated.
  const revealCourts = gameSlots.map(({ courtNo, waveNo }) => {
    const teams = pairingRows.filter((p) => p.court_no === courtNo && p.wave_no === waveNo);
    return {
      label: gameSlotLabel(courtNo, waveNo),
      teamA: teams[0] ? `${name(teams[0].player_a_id)} & ${name(teams[0].player_b_id)}` : '—',
      teamB: teams[1] ? `${name(teams[1].player_a_id)} & ${name(teams[1].player_b_id)}` : null,
    };
  });
  const seatedIds = new Set(pairingRows.flatMap((p) => [p.player_a_id, p.player_b_id]));
  const revealSitting = roster.filter((p) => !p.withdrawn_at && !seatedIds.has(p.id)).map((p) => p.display_name);
  const showOrganizerReveal = !!currentRound && ['revealed', 'playing'].includes(currentRound.state) && revealCourts.length > 0;
  // No-show swap candidates: someone seated ↔ someone on the bench.
  const seatedForSwap = [...seatedIds].map((pid) => roster.find((p) => p.id === pid)).filter((p): p is PlayerRow => !!p);
  const benchForSwap = roster.filter((p) => !p.withdrawn_at && !seatedIds.has(p.id));
  const canSwap = !!currentRound && ['revealed', 'playing'].includes(currentRound.state) && seatedForSwap.length > 0 && benchForSwap.length > 0;
  const scoredCourtCount = scoreRows.filter((score) => score.completed_at).length;
  const canOpenBallot = !!currentRound && !drawStarted && hasLockedBallots;
  const canLockBallot = !!currentRound && hasOpenBallots && !drawStarted;
  const canDraw = currentRound?.state === 'locked';

  // Draw preview + gender-balance guardrail: how the current pools will seat vs
  // sit next round (mirrors the draw's even-teams plan). Warns the organizer
  // before they draw when the roster forces people to sit every round.
  const activeRoster = roster.filter((p) => !p.withdrawn_at);
  const poolOf = (p: PlayerRow) => stateRows.find((s) => s.player_id === p.id)?.pairing_pool ?? (p.gender === 'f' ? 'b' : 'a');
  const poolA = activeRoster.filter((p) => poolOf(p) === 'a').length;
  const poolB = activeRoster.filter((p) => poolOf(p) === 'b').length;
  const teamPlan = mixerTeamPlan(poolA, poolB);
  const sittingPerRound = teamPlan.sitA + teamPlan.sitB;
  const genderMode = (t.gender_mode ?? 'open') as string;
  const poolsLopsided = Math.abs(poolA - poolB) > 1;
  // Vote simulation writes ballots, which the DB only accepts while the round
  // is open (same rule real voters hit).
  const canSimulate = currentRound?.state === 'open';
  const canStartPlay = currentRound?.state === 'revealed';
  const canMarkDone = (currentRound?.state === 'playing' || currentRound?.state === 'revealed') && (currentCourtCount === 0 || scoredCourtCount >= currentCourtCount);

  // Ballot participation (blind — who has locked in, never who for) for the ring.
  const confirmedSet = new Set(
    ((ballotRows ?? []) as { player_id: string; confirmed_at: string | null }[])
      .filter((b) => b.confirmed_at != null)
      .map((b) => b.player_id),
  );
  const votedNames = roster.filter((p) => confirmedSet.has(p.id)).map((p) => p.display_name);
  const votedCount = votedNames.length;
  // Armed-draw weights derived from the tuned formula knobs (alpha/beta/gamma).
  const wSum = Number(cfg?.alpha ?? 0) + Number(cfg?.beta ?? 0) + Number(cfg?.gamma ?? 0);
  const wPct = (w: number | undefined) => (wSum > 0 ? Math.round((Number(w ?? 0) / wSum) * 100) : 0);
  const anonCount = roster.filter((p) => !p.profile_id).length;
  const entryFee = Number(cfg?.entry_fee ?? 0);
  // "Needs your attention" — players who haven't paid their entry (handoff
  // admin.html attention banner).
  const unpaidPlayers = roster.filter(
    (p) => !p.withdrawn_at && !paymentRows.some((pay) => pay.player_id === p.id && pay.type === 'entry' && pay.status === 'confirmed'),
  );
  const outstanding = Math.round(unpaidPlayers.length * entryFee);

  // Roster tab data table (mirrors the desktop handoff). One row per player,
  // folding in each player's entry payment + token balance so the table is a
  // single source of truth instead of the old split card sections.
  const selfPlayerId = user ? roster.find((p) => p.profile_id === user.id)?.id ?? null : null;
  const startingTokens = Number(cfg?.starting_tokens ?? 0);
  const rosterTableRows: RosterTableRow[] = roster.map((p, index) => {
    const state = stateRows.find((s) => s.player_id === p.id);
    const entry = paymentRows.find((pay) => pay.player_id === p.id && pay.type === 'entry');
    const payment = entry
      ? entry.status === 'confirmed'
        ? { label: `Paid · ${entry.method}`, tone: 'ok' as const }
        : { label: `Pending · ${entry.method}`, tone: 'pend' as const }
      : null;
    return {
      id: p.id,
      name: p.display_name,
      sub: p.id === selfPlayerId ? 'ME' : `P${index + 1}`,
      avatar: mixerAvatarFor(p, selfPlayerId ?? undefined),
      anon: !p.profile_id,
      dupr: p.dupr,
      gender: p.gender,
      pool: state?.pairing_pool ?? (p.gender === 'f' ? 'b' : 'a'),
      tokens: state ? state.tokens_base_remaining + state.tokens_bought_remaining : startingTokens,
      payment,
      paymentId: entry?.id ?? null,
      paymentStatus: entry?.status ?? null,
      withdrawn: !!p.withdrawn_at,
    };
  });
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
      {showOrganizerReveal && currentRound && (
        <OrganizerRevealTakeover roundId={currentRound.id} roundNo={currentRound.round_no} courts={revealCourts} sittingOut={revealSitting} />
      )}
      <CockpitTabsProvider tournamentId={id} initialTab={activeTab as CockpitTab}>
      <div className="mx-auto grid w-full max-w-[1440px] grid-cols-1 lg:grid-cols-[248px_minmax(0,1fr)]">
        <CockpitSidebar
          tournamentId={id}
          eventName={t.name}
          state={currentRound?.state ?? null}
          roundNo={currentRound?.round_no ?? null}
          roundsTotal={cfg?.rounds ?? null}
          playerCount={roster.length}
          pendingPayments={pendingPayments}
        />
        <div className="min-w-0">
          <CockpitTopbar
            roundNo={currentRound?.round_no ?? null}
            state={currentRound?.state ?? null}
            players={roster.length}
            paid={paidCount}
            pending={pendingPayments}
            recapHref={`/tournaments/${id}/recap`}
          />
          <div id="main" className="px-5 pb-24 pt-6 lg:px-7">
        {sp.error && <Notice tone="error">{sp.error}</Notice>}
        {sp.ok && <Notice tone="ok">{sp.ok}</Notice>}

        {!cfg || !currentRound ? (
          <ActionForm action={initializeMixerEvent} className="rounded-2xl bg-white p-5 text-center" style={{ border: '1px dashed var(--line)' }}>
            <input type="hidden" name="tournament_id" value={id} />
            <div className="text-[15px] font-semibold text-ink">Mixer config is not initialized</div>
            <div className="mt-1 text-xs text-ink-3">Create default tokens, chips, Round 1, and player event state.</div>
            <button className="mt-4 rounded-2xl px-5 py-3 text-sm font-semibold" style={{ background: 'var(--court)', color: 'oklch(0.2 0.04 140)' }}>
              Initialize Mixer
            </button>
          </ActionForm>
        ) : (
          <>
            <CockpitPanel id="run">
              <>
                {unpaidPlayers.length > 0 && entryFee > 0 && (
                  <div className="mb-5">
                    <div className="mono mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[.14em]" style={{ color: 'var(--text3)' }}>
                      Needs your attention
                      <span className="grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] font-bold text-white" style={{ background: 'var(--serve)' }}>1</span>
                    </div>
                    <div
                      className="flex items-center gap-3.5 rounded-2xl p-4"
                      style={{ background: 'color-mix(in oklch, var(--serve) 8%, var(--surface-card))', border: '1px solid color-mix(in oklch, var(--serve) 34%, var(--line))', borderLeft: '4px solid var(--serve)' }}
                    >
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-[18px]" style={{ background: 'var(--serve)', color: '#fff' }}>$</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[15px] font-semibold" style={{ color: 'var(--text)' }}>
                          {unpaidPlayers.length} player{unpaidPlayers.length === 1 ? " hasn't" : "s haven't"} paid
                        </div>
                        <div className="truncate text-[12.5px]" style={{ color: 'var(--text3)' }}>
                          ${outstanding} outstanding · {unpaidPlayers.slice(0, 3).map((p) => p.display_name.split(' ')[0]).join(', ')}
                          {unpaidPlayers.length > 3 ? ` +${unpaidPlayers.length - 3}` : ''}
                        </div>
                      </div>
                      <Link
                        href={`/tournaments/${id}/mixer/admin?tab=roster`}
                        className="shrink-0 rounded-xl px-4 py-2 text-[13px] font-semibold"
                        style={{ background: 'var(--surface-raise)', color: 'var(--text)', border: '1px solid var(--line-2)' }}
                      >
                        Nudge
                      </Link>
                    </div>
                  </div>
                )}

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
                          {currentRound.state === 'open' && currentRound.lock_at && (
                            <div className="mono mt-1 flex items-center gap-1.5 text-[12.5px] font-semibold" style={{ color: 'var(--serve)' }}>
                              <span className="inline-block h-1.5 w-1.5 animate-pulse-dot rounded-full" style={{ background: 'var(--serve)' }} />
                              <CountdownTimer lockAt={currentRound.lock_at} active prefix="Ballots lock in " closedLabel="Locking…" />
                            </div>
                          )}
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
                      <ActionForm action={setMixerVotingWindow} className="mt-2.5 flex items-center gap-2">
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
                      </ActionForm>
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
                      {/* Gender-balance guardrail — preview the seating before drawing. */}
                      <div
                        className="mb-3.5 rounded-xl p-3 text-[12.5px]"
                        style={{
                          background: sittingPerRound > 0 ? 'color-mix(in oklch, var(--amber, oklch(0.8 0.12 85)) 14%, var(--surface-inset))' : 'var(--surface-inset)',
                          border: `1px solid ${sittingPerRound > 0 ? 'color-mix(in oklch, var(--amber, oklch(0.8 0.12 85)) 45%, var(--line))' : 'var(--line)'}`,
                        }}
                      >
                        <div className="font-semibold" style={{ color: 'var(--text)' }}>
                          {teamPlan.teams} team{teamPlan.teams === 1 ? '' : 's'} · {teamPlan.teams / 2} game{teamPlan.teams / 2 === 1 ? '' : 's'}
                          {sittingPerRound > 0 ? ` · ${sittingPerRound} sit each round` : ' · everyone plays'}
                        </div>
                        {sittingPerRound > 0 && (
                          <div className="mt-1" style={{ color: 'var(--text3)' }}>
                            {genderMode === 'mixed'
                              ? `${poolA} in pool A, ${poolB} in pool B — mixed doubles pairs one from each side.${poolsLopsided ? ' Balance the roster or switch to Open mode, then Re-pool teams (Rerun & reset), to seat more.' : ' Byes rotate fairly.'}`
                              : `An odd headcount means ${sittingPerRound} take a rotating bye — byes rotate fairly so no one sits twice before everyone's sat once.`}
                          </div>
                        )}
                      </div>
                      <DrawArmedModal
                        tournamentId={id}
                        roundId={currentRound.id}
                        roundNo={currentRound.round_no}
                        canDraw={canDraw}
                        weights={{ votes: wPct(cfg.alpha), skill: wPct(cfg.beta), novelty: wPct(cfg.gamma) }}
                        teams={teamPlan.teams}
                        games={teamPlan.teams / 2}
                        sittingPerRound={sittingPerRound}
                        poolLabel={
                          genderMode === 'mixed'
                            ? `${poolA} in pool A, ${poolB} in pool B.`
                            : 'Byes rotate fairly so no one sits twice before everyone has sat once.'
                        }
                      />
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
                          label={currentCourtCount > 0 && scoredCourtCount < currentCourtCount ? `Score ${currentCourtCount - scoredCourtCount} game${currentCourtCount - scoredCourtCount === 1 ? '' : 's'}` : 'Mark done'}
                          disabled={!canMarkDone}
                        />
                      </div>
                      <ActionForm action={finalizeMixerEvent} className="mt-2.5">
                        <input type="hidden" name="tournament_id" value={id} />
                        <button
                          className="w-full rounded-2xl px-4 py-3 text-sm font-semibold"
                          style={{ background: 'var(--surface-raise)', color: 'var(--text)', border: '1px solid var(--line-2)' }}
                        >
                          Finalize standings, raffle &amp; pools
                        </button>
                      </ActionForm>
                      <div className="mt-3">
                        <RoundRail rounds={roundRows} activeRoundId={currentRound.id} />
                      </div>
                    </div>
                  </div>

                  {/* RIGHT — live read-outs */}
                  <div className="flex flex-col gap-[18px]">
                    <TestHarnessPanel
                      tournamentId={id}
                      roundId={currentRound.id}
                      roundNo={currentRound.round_no}
                      canSimulate={canSimulate}
                      canPlay={currentRound.state !== 'done' && finalStandings.length === 0}
                      eventFinalized={finalStandings.length > 0}
                      votedCount={votedCount}
                      rosterCount={roster.length}
                    />
                    {/* Recovery controls — mistakes happen on live nights. */}
                    <div className="rounded-[18px] p-5" style={{ border: '1px solid color-mix(in oklch, var(--berry, oklch(0.55 0.2 12)) 35%, var(--line))', background: 'var(--surface-card)' }}>
                      <h3 className="text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Rerun &amp; reset</h3>
                      <div className="mb-3 text-[12.5px]" style={{ color: 'var(--text3)' }}>
                        Fix a draw that fired early or start the night over. Roster and payments always survive.
                      </div>
                      <div className="grid gap-2">
                        <ActionForm action={repoolMixerRoster} confirm="Re-pool every player from their gender and the event's gender mode? Wallets and votes are kept. Follow with Reopen + Run the draw to redraw the teams.">
                          <input type="hidden" name="tournament_id" value={id} />
                          <button className="w-full rounded-xl px-4 py-2.5 text-[13px] font-semibold" style={{ background: 'var(--surface-raise)', color: 'var(--text)', border: '1px solid var(--line-2)' }}>
                            Re-pool teams from genders (roster/config changed)
                          </button>
                        </ActionForm>
                        <ActionForm action={reopenMixerRound} confirm={`Reopen round ${currentRound.round_no}? Its pairings and scores already entered are cleared, and voting goes live again.`}>
                          <input type="hidden" name="tournament_id" value={id} />
                          <input type="hidden" name="round_id" value={currentRound.id} />
                          <button className="w-full rounded-xl px-4 py-2.5 text-[13px] font-semibold" style={{ background: 'var(--surface-raise)', color: 'var(--text)', border: '1px solid var(--line-2)' }}>
                            Reopen round {currentRound.round_no} (clear draw + scores)
                          </button>
                        </ActionForm>
                        <ActionForm action={resetMixerRoundVotes} confirm={`Wipe every ballot for round ${currentRound.round_no} and refund the tokens?`}>
                          <input type="hidden" name="tournament_id" value={id} />
                          <input type="hidden" name="round_id" value={currentRound.id} />
                          <button className="w-full rounded-xl px-4 py-2.5 text-[13px] font-semibold" style={{ background: 'var(--surface-raise)', color: 'var(--text)', border: '1px solid var(--line-2)' }}>
                            Reset round {currentRound.round_no} votes (refund tokens)
                          </button>
                        </ActionForm>
                        <ActionForm action={resetMixerEvent} confirm="Reset the ENTIRE event? All pairings, scores, ballots, and bets are wiped; tokens and chips are restored; every round reopens. Roster and payments are kept.">
                          <input type="hidden" name="tournament_id" value={id} />
                          <button className="w-full rounded-xl px-4 py-2.5 text-[13px] font-bold" style={{ background: 'color-mix(in oklch, oklch(0.55 0.2 12) 14%, var(--surface-card))', color: 'oklch(0.55 0.2 12)', border: '1px solid color-mix(in oklch, oklch(0.55 0.2 12) 45%, var(--line))' }}>
                            Reset whole event &amp; rerun
                          </button>
                        </ActionForm>
                      </div>
                    </div>
                    {canSwap && (
                      <div className="rounded-[18px] p-5" style={PANEL}>
                        <h3 className="text-[15px] font-semibold" style={{ color: 'var(--text)' }}>No-show? Swap in a sub</h3>
                        <div className="mb-3 text-[12.5px]" style={{ color: 'var(--text3)' }}>
                          A player didn&apos;t show after the draw — swap in someone from the bench. Their court, partner, and opponent are preserved; the no-show takes the bench.
                        </div>
                        <ActionForm action={swapMixerPlayer} className="grid gap-2">
                          <input type="hidden" name="tournament_id" value={id} />
                          <input type="hidden" name="round_id" value={currentRound.id} />
                          <select name="out_player" defaultValue="" className="h-10 rounded-xl bg-paper-2 px-3 text-sm font-semibold text-ink" style={{ border: '1px solid var(--line)' }} required aria-label="Player to swap out">
                            <option value="" disabled>Swap out (no-show)…</option>
                            {seatedForSwap.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
                          </select>
                          <select name="in_player" defaultValue="" className="h-10 rounded-xl bg-paper-2 px-3 text-sm font-semibold text-ink" style={{ border: '1px solid var(--line)' }} required aria-label="Replacement from bench">
                            <option value="" disabled>Swap in (from bench)…</option>
                            {benchForSwap.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
                          </select>
                          <button className="h-10 rounded-xl px-4 text-[13px] font-semibold" style={{ background: 'var(--surface-raise)', color: 'var(--text)', border: '1px solid var(--line-2)' }}>Swap players</button>
                        </ActionForm>
                      </div>
                    )}
                    <div className="rounded-[18px] p-5" style={PANEL}>
                      <h3 className="flex items-center gap-2 text-[15px] font-semibold" style={{ color: 'var(--text)' }}>
                        Live courts
                        {currentCourtCount > 0 && <span className="chip chip-live"><span className="dot" />R{currentRound.round_no}</span>}
                      </h3>
                      {currentCourtCount === 0 ? (
                        <div className="mt-2 text-[13px]" style={{ color: 'var(--text3)' }}>No courts revealed yet — run the draw to seat this round.</div>
                      ) : (
                        <div className="mt-3 flex flex-col gap-2">
                          {gameSlots.map(({ courtNo, waveNo }) => {
                            const teams = pairingRows.filter((p) => p.court_no === courtNo && p.wave_no === waveNo);
                            const score = scoreRows.find((s) => s.court_no === courtNo && s.wave_no === waveNo);
                            const live = !!score && !score.completed_at;
                            return (
                              <CourtMini
                                key={slotKey(courtNo, waveNo)}
                                courtNo={courtNo}
                                waveNo={waveNo}
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
            </CockpitPanel>

            <CockpitPanel id="roster">
              <RosterTable
                tournamentId={id}
                inviteHref={`/tournaments/${id}/invite`}
                rows={rosterTableRows}
              />
            </CockpitPanel>

            <CockpitPanel id="scores">
              <Section title="Courts and scores">
                <CockpitScoreBoard
                  tournamentId={id}
                  roundNo={currentRound.round_no}
                  roundsTotal={cfg.rounds ?? roundRows.length}
                  results={scoreResults}
                  currentRoundNo={currentRound.round_no}
                  canDraw={canDraw}
                  drawButton={
                    <DrawArmedModal
                      tournamentId={id}
                      roundId={currentRound.id}
                      roundNo={currentRound.round_no}
                      canDraw={canDraw}
                      weights={{ votes: wPct(cfg.alpha), skill: wPct(cfg.beta), novelty: wPct(cfg.gamma) }}
                      teams={teamPlan.teams}
                      games={teamPlan.teams / 2}
                      sittingPerRound={sittingPerRound}
                      poolLabel={
                        genderMode === 'mixed'
                          ? `${poolA} in pool A, ${poolB} in pool B.`
                          : 'Byes rotate fairly so no one sits twice before everyone has sat once.'
                      }
                      triggerLabel={`Run the draw for Round ${currentRound.round_no} →`}
                    />
                  }
                />
              </Section>
            </CockpitPanel>

            <CockpitPanel id="standings">
              <Section title="Standings">
                <StandingsBoard
                  tournamentId={id}
                  results={scoreResults}
                  genders={genders}
                  finalized={finalStandings.length > 0}
                  selfPlayerId={selfPlayerId}
                />
              </Section>
            </CockpitPanel>

            <CockpitPanel id="prizes">
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
            </CockpitPanel>

            <CockpitPanel id="setup">
              <Section title="Event setup">
                <ConfigForm tournamentId={id} cfg={cfg} prizeBuckets={prizeBuckets} paymentMethods={paymentMethods} playerCount={roster.length} betChips={betChips} />
              </Section>
            </CockpitPanel>
          </>
        )}
          </div>
        </div>
      </div>
      </CockpitTabsProvider>
    </DesktopSurface>
  );
}

// ---------------------------------------------------------------------------
// Desktop night cockpit chrome (handoff admin.html): 248px sidebar + topbar,
// mission-control Run pane primitives. Blind-vote guardrail: participation
// only — the ring and facepile show who has voted, never who they voted for.
// ---------------------------------------------------------------------------

const PANEL: React.CSSProperties = { background: 'var(--card)', border: '1px solid var(--line)' };

function CockpitSidebar({
  tournamentId,
  eventName,
  state,
  roundNo,
  roundsTotal,
  playerCount,
  pendingPayments,
}: {
  tournamentId: string;
  eventName: string;
  state: string | null;
  roundNo: number | null;
  roundsTotal: number | null;
  playerCount: number;
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
      <CockpitNavList pendingPayments={pendingPayments} />
      <div className="hidden flex-1 lg:block" />
      <div className="mono px-2.5 pb-1.5 pt-2 text-[10px] uppercase tracking-[.14em]" style={{ color: 'var(--text3)' }}>Viewing as</div>
      <div className="flex gap-1 rounded-[11px] p-[3px]" style={{ background: 'var(--surface-raise)', border: '1px solid var(--line)' }}>
        <Link href={`/tournaments/${tournamentId}/mixer`} className="flex-1 rounded-lg py-2 text-center text-[12.5px] font-semibold" style={{ color: 'var(--text3)' }}>
          Player
        </Link>
        <span className="flex-1 rounded-lg py-2 text-center text-[12.5px] font-semibold" style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}>
          Organizer
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

function CockpitTopbar({ roundNo, state, players, paid, pending, recapHref }: { roundNo: number | null; state: string | null; players: number; paid: number; pending: number; recapHref: string }) {
  return (
    <div
      className="sticky top-0 z-20 flex h-[66px] items-center gap-4 border-b px-5 lg:px-7"
      style={{ background: 'color-mix(in oklch, var(--bg) 82%, transparent)', backdropFilter: 'blur(10px)', borderColor: 'var(--line)' }}
    >
      <div
        className="absolute inset-x-0 top-0 h-[3px]"
        style={{ background: 'linear-gradient(90deg, oklch(0.55 0.2 25) 0 40%, #fff 40% 60%, oklch(0.42 0.14 258) 60%)' }}
      />
      <CockpitTopbarTitle roundNo={roundNo} state={state} players={players} paid={paid} pending={pending} />
      {/* Recap / history — the topbar clock (handoff admin.html). */}
      <Link
        href={recapHref}
        aria-label="Recap & history"
        title="Recap & history"
        className="ml-auto grid h-9 w-9 shrink-0 place-items-center rounded-full"
        style={{ background: 'var(--surface-card)', color: 'var(--text2)', border: '1px solid var(--line-2)' }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
          <path d="M12 8v4l3 2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      </Link>
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

// Organizer test harness — simulate absent players' voting so the whole flow
// (vote → draw → score → standings) can be exercised without many logins. Every
// button routes through a manager-gated RPC; a non-manager is refused server-side.
function TestHarnessPanel({
  tournamentId,
  roundId,
  roundNo,
  canSimulate,
  canPlay,
  eventFinalized,
  votedCount,
  rosterCount,
}: {
  tournamentId: string;
  roundId: string;
  roundNo: number;
  canSimulate: boolean;
  canPlay: boolean;
  eventFinalized: boolean;
  votedCount: number;
  rosterCount: number;
}) {
  const unvoted = Math.max(0, rosterCount - votedCount);
  return (
    <div
      className="rounded-[18px] p-5"
      style={{ border: '1px dashed color-mix(in oklch, var(--accent) 45%, var(--line))', background: 'color-mix(in oklch, var(--accent) 6%, var(--surface-card))' }}
    >
      <h3 className="flex items-center gap-2 text-[15px] font-semibold" style={{ color: 'var(--text)' }}>
        🧪 Test harness
        <span className="chip">Round {roundNo}</span>
      </h3>
      <div className="mb-3 text-[12.5px]" style={{ color: 'var(--text3)' }}>
        Drive the whole flow without 16 logins. Simulated votes obey the same budget, pools and lock as real ones; auto-play
        also draws and posts random finals.
      </div>

      <div className="mono mb-1.5 text-[10px] uppercase tracking-[0.1em]" style={{ color: 'var(--text3)' }}>Votes</div>
      {!canSimulate ? (
        <div className="rounded-xl px-3 py-2.5 text-[12.5px]" style={{ background: 'var(--surface-inset)', border: '1px solid var(--line)', color: 'var(--text3)' }}>
          Open the ballot to simulate votes for this round.
        </div>
      ) : (
        <div className="grid gap-2">
          <form action={simulateRoundVotesAction}>
            <input type="hidden" name="tournament_id" value={tournamentId} />
            <input type="hidden" name="round_id" value={roundId} />
            <input type="hidden" name="mode" value="missing" />
            <button className="w-full rounded-2xl px-4 py-3 text-sm font-semibold" style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}>
              Fill ballots for {unvoted} unvoted player{unvoted === 1 ? '' : 's'}
            </button>
          </form>
          <ConfirmForm action={simulateRoundVotesAction} confirm={`Wipe every ballot for round ${roundNo} (refunding tokens) and re-roll fresh votes for everyone?`}>
            <input type="hidden" name="tournament_id" value={tournamentId} />
            <input type="hidden" name="round_id" value={roundId} />
            <input type="hidden" name="mode" value="all" />
            <button className="w-full rounded-xl px-4 py-2.5 text-[13px] font-semibold" style={{ background: 'var(--surface-raise)', color: 'var(--text)', border: '1px solid var(--line-2)' }}>
              Re-roll all ballots
            </button>
          </ConfirmForm>
        </div>
      )}

      <div className="mono mb-1.5 mt-4 text-[10px] uppercase tracking-[0.1em]" style={{ color: 'var(--text3)' }}>Auto-play</div>
      {eventFinalized ? (
        <div className="rounded-xl px-3 py-2.5 text-[12.5px]" style={{ background: 'var(--surface-inset)', border: '1px solid var(--line)', color: 'var(--text3)' }}>
          Event is finalized. Reset it above to run again.
        </div>
      ) : (
        <div className="grid gap-2">
          <ConfirmForm action={playRoundAction} confirm={`Play round ${roundNo} end to end (simulate any missing votes, lock, draw, and post random finals)?`}>
            <input type="hidden" name="tournament_id" value={tournamentId} />
            <button disabled={!canPlay} className="w-full rounded-xl px-4 py-2.5 text-[13px] font-semibold disabled:cursor-not-allowed disabled:opacity-45" style={{ background: 'var(--surface-raise)', color: 'var(--text)', border: '1px solid var(--line-2)' }}>
              ▶ Play round {roundNo} to the end
            </button>
          </ConfirmForm>
          <ConfirmForm action={autoNightAction} confirm="Auto-play every remaining round (votes, draws, random scores) and finalize standings, raffle & pools?">
            <input type="hidden" name="tournament_id" value={tournamentId} />
            <button disabled={!canPlay} className="w-full rounded-2xl px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-45" style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}>
              ⏭ Auto-play to finals
            </button>
          </ConfirmForm>
        </div>
      )}

      <div className="mono mb-1.5 mt-4 text-[10px] uppercase tracking-[0.1em]" style={{ color: 'var(--text3)' }}>Fresh test event</div>
      <ConfirmForm action={seedTestTournamentAction} confirm="Create a brand-new mixer with a full placeholder roster and auto-play the entire night? You'll land on the new event.">
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <input name="name" defaultValue="Test Mixer" aria-label="Test event name" className="h-10 rounded-xl px-3 text-[13px]" style={{ background: 'var(--surface-inset)', border: '1px solid var(--line)', color: 'var(--text)' }} />
          <select name="player_count" defaultValue="16" aria-label="Player count" className="h-10 rounded-xl px-2 text-[13px]" style={{ background: 'var(--surface-inset)', border: '1px solid var(--line)', color: 'var(--text)' }}>
            <option value="8">8</option>
            <option value="12">12</option>
            <option value="16">16</option>
            <option value="20">20</option>
            <option value="24">24</option>
          </select>
        </div>
        <select name="gender_mode" defaultValue="mixed" aria-label="Gender mode" className="mt-2 h-10 w-full rounded-xl px-2 text-[13px]" style={{ background: 'var(--surface-inset)', border: '1px solid var(--line)', color: 'var(--text)' }}>
          <option value="mixed">Mixed doubles</option>
          <option value="open">Open (gender-blind)</option>
          <option value="same">Same-gender teams</option>
        </select>
        <button className="mt-2 w-full rounded-xl px-4 py-2.5 text-[13px] font-semibold" style={{ background: 'var(--surface-raise)', color: 'var(--text)', border: '1px solid var(--line-2)' }}>
          🌱 Seed &amp; auto-play a new mixer
        </button>
      </ConfirmForm>
    </div>
  );
}

function CourtMini({ courtNo, waveNo, teamA, teamB, scoreA, scoreB, live }: { courtNo: number; waveNo: number; teamA: string; teamB: string; scoreA: number; scoreB: number; live: boolean }) {
  return (
    <div
      className="flex items-center gap-3 rounded-xl p-3"
      style={{ border: '1px solid var(--line)', borderLeft: live ? '3px solid var(--serve)' : '1px solid var(--line)' }}
    >
      <span className="mono w-12 text-[11px]" style={{ color: 'var(--text3)' }}>CT {courtNo}{waveNo > 1 ? `·H${waveNo}` : ''}</span>
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
