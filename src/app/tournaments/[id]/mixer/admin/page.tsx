import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
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
  confirmMixerPayment,
  drawMixerRound,
  finalizeMixerEvent,
  initializeMixerEvent,
  scoreMixerCourt,
  setMixerRoundState,
  updateMixerConfig,
  updateMixerPlayerPool,
} from '../actions';

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; ok?: string; error?: string }>;
};

type TournamentRow = {
  id: string;
  name: string;
  format: string;
  owner_user_id: string;
  status: string;
  invite_code: string;
};

type ConfigRow = {
  starting_tokens: number;
  starting_chips: number;
  rounds: number;
  courts: number;
  lock_mode: 'timer' | 'manual';
  lock_seconds: number;
  alpha: number;
  beta: number;
  gamma: number;
  tau: number;
  grief_floor: number;
  repeat_decay: number;
  entry_fee: number;
  pay_to_play_enabled: boolean;
  boost_tokens: number;
  boost_price: number;
  boost_limit: number;
  betting_enabled: boolean;
  raffle_enabled: boolean;
  downvotes_enabled: boolean;
  podium_markets: number;
  betting_prize_winners: number;
  betting_rake_pct: number;
  prize_buckets: unknown;
  payment_methods: unknown;
  raffle_prize: string;
  upvote_cap_per_target: number | null;
  bet_lock_round_no: number | null;
};

type RoundRow = {
  id: string;
  round_no: number;
  state: string;
  lock_at: string | null;
};

type PlayerRow = {
  id: string;
  display_name: string;
  gender: 'm' | 'f' | 'x' | null;
  profile_id: string | null;
  withdrawn_at: string | null;
};

type PairingRow = {
  id: string;
  player_a_id: string;
  player_b_id: string;
  court_no: number;
};

type ScoreRow = {
  court_no: number;
  team_a_score: number;
  team_b_score: number;
  completed_at: string | null;
};

type PaymentRow = {
  id: string;
  player_id: string;
  type: string;
  amount: number;
  method: string;
  status: string;
};

type StateRow = {
  player_id: string;
  pairing_pool: 'a' | 'b';
  tokens_base_remaining: number;
  tokens_bought_remaining: number;
  chips_remaining: number;
  sit_out_count: number;
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

type PrizeBuckets = {
  tournament: number;
  raffle: number;
  betting: number;
  reserve: number;
};

type PaymentMethod = {
  on: boolean;
  handle: string;
};

type PaymentMethods = {
  zelle: PaymentMethod;
  venmo: PaymentMethod;
  cash: PaymentMethod;
};

type OrganizerTab = 'run' | 'roster' | 'scores' | 'prizes' | 'setup';

const ORGANIZER_TABS: Array<{ id: OrganizerTab; label: string; description: string }> = [
  { id: 'run', label: 'Run', description: 'Ballot and draw' },
  { id: 'roster', label: 'Roster', description: 'Players and payments' },
  { id: 'scores', label: 'Scores', description: 'Courts and results' },
  { id: 'prizes', label: 'Prizes', description: 'Pots and raffle' },
  { id: 'setup', label: 'Setup', description: 'Rules and money' },
];

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
                            <span className="font-semibold text-ink">{name(p.player_id)}</span>
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

function OrganizerTabNav({
  tournamentId,
  active,
  pendingPayments,
}: {
  tournamentId: string;
  active: OrganizerTab;
  pendingPayments: number;
}) {
  return (
    <nav aria-label="Organizer sections" className="mb-4 overflow-x-auto">
      <div className="flex min-w-max gap-2">
        {ORGANIZER_TABS.map((tab) => {
          const on = active === tab.id;
          const badge = tab.id === 'roster' && pendingPayments > 0 ? pendingPayments : null;
          return (
            <Link
              key={tab.id}
              href={tab.id === 'run' ? `/tournaments/${tournamentId}/mixer/admin` : `/tournaments/${tournamentId}/mixer/admin?tab=${tab.id}`}
              aria-current={on ? 'page' : undefined}
              className="flex min-w-[104px] flex-col rounded-2xl px-3 py-2.5"
              style={{
                background: on ? 'var(--ink)' : '#fff',
                color: on ? 'var(--paper)' : 'var(--ink)',
                border: `1px solid ${on ? 'var(--ink)' : 'var(--line)'}`,
              }}
            >
              <span className="flex items-center justify-between gap-2 text-sm font-bold">
                {tab.label}
                {badge ? (
                  <span className="mono rounded-full px-1.5 py-0.5 text-[10px]" style={{ background: 'var(--serve)', color: 'var(--paper)' }}>
                    {badge}
                  </span>
                ) : null}
              </span>
              <span className="mt-0.5 text-[10.5px]" style={{ color: on ? 'oklch(0.82 0.02 95)' : 'var(--ink-3)' }}>
                {tab.description}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function AdminLink({ href, title, sub }: { href: string; title: string; sub: string }) {
  return (
    <Link href={href} className="rounded-2xl bg-white p-4" style={{ border: '1px solid var(--line)' }}>
      <span className="flex items-center justify-between gap-2 text-sm font-bold text-ink">
        {title}
        <span className="text-ink-3">{Icons.arrow}</span>
      </span>
      <span className="mt-1 block text-xs text-ink-3">{sub}</span>
    </Link>
  );
}

function getOrganizerTab(value: string | undefined): OrganizerTab {
  return ORGANIZER_TABS.some((tab) => tab.id === value) ? (value as OrganizerTab) : 'run';
}

function runEventHeadline(state: string) {
  switch (state) {
    case 'open':
      return 'Ballot is live';
    case 'locked':
      return 'Ballot locked';
    case 'drawing':
      return 'Drawing partners';
    case 'revealed':
      return 'Pairings revealed';
    case 'playing':
      return 'Games are on court';
    case 'done':
      return 'Round complete';
    default:
      return 'Ready to run';
  }
}

function runEventBody(state: string, lockMode: ConfigRow['lock_mode']) {
  switch (state) {
    case 'open':
      return lockMode === 'timer'
        ? 'Players are voting now. The configured timer will define when ballots should close.'
        : 'Players are voting now. Lock the ballot manually when the room is ready.';
    case 'locked':
      return 'Votes are sealed. Draw and reveal when players are watching.';
    case 'drawing':
      return 'The draw is in progress. Keep presentation mode ready for the reveal.';
    case 'revealed':
      return 'Partners and courts are visible. Start play when everyone reaches their court.';
    case 'playing':
      return 'Enter scores as courts finish so standings, raffle, and pools can settle cleanly.';
    case 'done':
      return 'Scores are in. Finalize the event or prepare the next voting window.';
    default:
      return 'Open the ballot to begin the Mixer round loop.';
  }
}

function ConfigForm({
  tournamentId,
  cfg,
  prizeBuckets,
  paymentMethods,
  playerCount,
  betChips,
}: {
  tournamentId: string;
  cfg: ConfigRow;
  prizeBuckets: PrizeBuckets;
  paymentMethods: PaymentMethods;
  playerCount: number;
  betChips: number;
}) {
  const pot = playerCount * Number(cfg.entry_fee);
  const lockHours = Math.floor(cfg.lock_seconds / 3600);
  const lockExtraSeconds = cfg.lock_seconds % 3600;
  return (
    <form action={updateMixerConfig} className="rounded-2xl bg-white p-4" style={{ border: '1px solid var(--line)' }}>
      <input type="hidden" name="tournament_id" value={tournamentId} />
      <div className="grid grid-cols-2 gap-3">
        <NumberField name="rounds" label="Rounds" value={cfg.rounds} min={1} max={50} />
        <NumberField name="courts" label="Courts" value={cfg.courts} min={1} max={16} />
        <NumberField name="starting_tokens" label="Start tokens" value={cfg.starting_tokens} min={1} max={100} />
        <NumberField name="starting_chips" label="Start chips" value={cfg.starting_chips} min={0} max={100000} />
      </div>

      <div className="mt-4 border-t pt-4" style={{ borderColor: 'var(--line)' }}>
        <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-3">Voting</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-semibold text-ink-3">Lock mode</span>
            <select name="lock_mode" defaultValue={cfg.lock_mode} className="mt-1 h-11 w-full rounded-xl bg-paper-2 px-3 text-sm font-semibold text-ink">
              <option value="timer">Countdown</option>
              <option value="manual">Manual close</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <NumberField name="lock_hours" label="Lock hours" value={lockHours} min={0} max={168} />
            <NumberField name="lock_extra_seconds" label="Fine-tune seconds" value={lockExtraSeconds} min={0} max={3599} />
          </div>
        </div>
        <div className="mt-2 text-xs text-ink-3">
          Current window: {formatLockDuration(cfg.lock_seconds)}. Use hours for signup-day voting windows; extra seconds are only for fine tuning.
        </div>
        <div className="mt-3 grid gap-2">
          <ToggleField name="downvotes_enabled" label="Downvotes" checked={cfg.downvotes_enabled} sub="Let players spend tokens on a gentle no-thanks." />
        </div>
      </div>

      <div className="mt-4 border-t pt-4" style={{ borderColor: 'var(--line)' }}>
        <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-3">Tokens and money</div>
        <div className="grid grid-cols-2 gap-3">
          <NumberField name="entry_fee" label="Entry fee" value={cfg.entry_fee} min={0} max={100000} prefix="$" />
          <NumberField name="boost_price" label="Boost price" value={cfg.boost_price} min={0} max={100000} prefix="$" />
          <NumberField name="boost_tokens" label="Boost tokens" value={cfg.boost_tokens} min={0} max={100} />
          <NumberField name="boost_limit" label="Boost limit" value={cfg.boost_limit} min={0} max={10} />
        </div>
        <div className="mt-3 grid gap-2">
          <ToggleField name="pay_to_play_enabled" label="Pay-to-play token boost" checked={cfg.pay_to_play_enabled} sub="Bought tokens affect matchmaking but never raffle tickets." />
          <ToggleField name="betting_enabled" label="Pooled betting" checked={cfg.betting_enabled} sub={`${betChips} chips currently staked.`} />
          <ToggleField name="raffle_enabled" label="Raffle draw" checked={cfg.raffle_enabled} sub="Tickets come from upvotes received plus unused base tokens." />
        </div>
      </div>

      <div className="mt-4 border-t pt-4" style={{ borderColor: 'var(--line)' }}>
        <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-3">Payment methods</div>
        <div className="grid gap-2">
          <PaymentMethodField name="zelle" label="Zelle" method={paymentMethods.zelle} placeholder="email or mobile number" />
          <PaymentMethodField name="venmo" label="Venmo" method={paymentMethods.venmo} placeholder="@username" />
          <ToggleField name="pay_cash_on" label="Cash / in person" checked={paymentMethods.cash.on} sub="No destination required." />
        </div>
      </div>

      <div className="mt-4 border-t pt-4" style={{ borderColor: 'var(--line)' }}>
        <div className="flex items-center justify-between gap-3">
          <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-3">Prize buckets</div>
          <div className="mono text-xs text-ink-3">pot {money(pot)}</div>
        </div>
        <div className="mt-3 grid gap-3">
          <RangeField name="bucket_tournament" label="Tournament" value={prizeBuckets.tournament * 100} amount={pot * prizeBuckets.tournament} />
          <RangeField name="bucket_raffle" label="Raffle" value={prizeBuckets.raffle * 100} amount={pot * prizeBuckets.raffle} />
          <RangeField name="bucket_betting" label="Betting" value={prizeBuckets.betting * 100} amount={pot * prizeBuckets.betting} />
          <RangeField name="bucket_reserve" label="Reserve" value={prizeBuckets.reserve * 100} amount={pot * prizeBuckets.reserve} />
          <label>
            <span className="text-xs font-semibold text-ink-3">Raffle prize</span>
            <input name="raffle_prize" defaultValue={cfg.raffle_prize ?? 'Raffle prize'} className="mt-1 h-11 w-full rounded-xl bg-paper-2 px-3 text-sm font-semibold text-ink" />
          </label>
        </div>
      </div>

      <details className="mt-4 rounded-2xl bg-paper-2 p-3">
        <summary className="cursor-pointer text-sm font-bold text-ink">Matching formula</summary>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <NumberField name="alpha" label="Alpha (α)" value={cfg.alpha} min={0} max={100} step="0.1" />
          <NumberField name="beta" label="Beta (β)" value={cfg.beta} min={0} max={100} step="0.1" />
          <NumberField name="gamma" label="Gamma (γ)" value={cfg.gamma} min={0} max={100} step="0.1" />
          <NumberField name="tau" label="Tau (τ)" value={cfg.tau} min={0.01} max={100} step="0.1" />
          <NumberField name="grief_floor" label="Grief floor (C)" value={cfg.grief_floor} min={0} max={100} step="0.1" />
          <NumberField name="repeat_decay" label="Repeat decay" value={cfg.repeat_decay} min={0} max={1} step="0.05" />
        </div>
        <div className="mt-2 text-[11px] text-ink-3">
          score = α·(u+u′) + β·√(u·u′) − γ·(d+d′), floored at −C, then weight = e<sup>score/τ</sup> · decay<sup>prior pairings</sup>.
        </div>
      </details>

      <details className="mt-3 rounded-2xl bg-paper-2 p-3">
        <summary className="cursor-pointer text-sm font-bold text-ink">Fairness & betting cutoffs</summary>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <NumberField name="upvote_cap_per_target" label="Upvotes / target" value={cfg.upvote_cap_per_target ?? 3} min={1} max={99} />
          <label className="block">
            <span className="text-xs font-semibold text-ink-3">Betting closes before round</span>
            <input
              name="bet_lock_round_no"
              type="number"
              min={1}
              max={50}
              defaultValue={cfg.bet_lock_round_no ?? ''}
              placeholder={`= last (${cfg.rounds})`}
              className="mt-1 h-11 w-full rounded-xl bg-paper-2 px-3 text-sm font-semibold text-ink"
              style={{ border: '1px solid var(--line)' }}
            />
          </label>
          <NumberField name="podium_markets" label="Podium markets" value={cfg.podium_markets} min={1} max={8} />
          <NumberField name="betting_prize_winners" label="Betting winners" value={cfg.betting_prize_winners} min={1} max={20} />
          <NumberField name="betting_rake_pct" label="Rake %" value={Number(cfg.betting_rake_pct) * 100} min={0} max={100} step="1" />
        </div>
        <div className="mt-2 text-[11px] text-ink-3">
          Upvote cap blocks vote farming per target. Betting cutoff round rejects wagers once that round starts play — leave blank to close at the final round.
        </div>
      </details>

      <button className="mt-4 w-full rounded-2xl px-4 py-3 text-sm font-bold" style={{ background: 'var(--court)', color: 'oklch(0.2 0.04 140)' }}>
        Save event settings
      </button>
    </form>
  );
}

function NumberField({ name, label, value, min, max, step = '1', prefix }: { name: string; label: string; value: string | number; min: number; max: number; step?: string; prefix?: string }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-ink-3">{label}</span>
      <div className="mt-1 flex h-11 items-center rounded-xl bg-paper-2 px-3">
        {prefix && <span className="mr-1 text-sm font-semibold text-ink-3">{prefix}</span>}
        <input name={name} type="number" min={min} max={max} step={step} defaultValue={value} className="mono w-full bg-transparent text-sm font-bold text-ink outline-none" />
      </div>
    </label>
  );
}

function ToggleField({ name, label, checked, sub }: { name: string; label: string; checked: boolean; sub?: string }) {
  return (
    <label className="flex items-center gap-3 rounded-xl bg-paper-2 px-3 py-2">
      <input name={name} type="checkbox" defaultChecked={checked} className="h-5 w-5 accent-[var(--court)]" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-ink">{label}</span>
        {sub && <span className="block text-xs text-ink-3">{sub}</span>}
      </span>
    </label>
  );
}

function PaymentMethodField({ name, label, method, placeholder }: { name: 'zelle' | 'venmo'; label: string; method: PaymentMethod; placeholder: string }) {
  return (
    <div className="rounded-xl bg-paper-2 px-3 py-2">
      <ToggleField name={`pay_${name}_on`} label={label} checked={method.on} />
      <input name={`pay_${name}_handle`} defaultValue={method.handle} placeholder={placeholder} className="mt-2 h-10 w-full rounded-xl bg-white px-3 text-sm font-semibold text-ink" style={{ border: '1px solid var(--line)' }} />
    </div>
  );
}

function RangeField({ name, label, value, amount }: { name: string; label: string; value: number; amount: number }) {
  return (
    <label className="block">
      <span className="flex items-center justify-between text-xs font-semibold text-ink-3">
        <span>{label}</span>
        <span className="mono">{Math.round(value)}% · {money(amount)}</span>
      </span>
      <input name={name} type="range" min={0} max={100} step={5} defaultValue={Math.round(value)} className="mt-1 w-full accent-[var(--court)]" />
    </label>
  );
}

function PrizeBucket({ label, pct, amount }: { label: string; pct: number; amount: number }) {
  return (
    <div className="rounded-xl bg-white p-3" style={{ border: '1px solid var(--line)' }}>
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold text-ink">{label}</span>
        <span className="mono text-ink">{Math.round(pct * 100)}%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-paper-2">
        <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, pct * 100))}%`, background: 'var(--court)' }} />
      </div>
      <div className="mt-1 text-xs text-ink-3">{money(amount)}</div>
    </div>
  );
}

function PaymentButton({ tournamentId, paymentId, status, label }: { tournamentId: string; paymentId: string; status: 'confirmed' | 'refunded'; label: string }) {
  return (
    <form action={confirmMixerPayment}>
      <input type="hidden" name="tournament_id" value={tournamentId} />
      <input type="hidden" name="payment_id" value={paymentId} />
      <input type="hidden" name="status" value={status} />
      <button className="rounded-xl px-3 py-2 text-xs font-semibold" style={{
        background: status === 'confirmed' ? 'var(--court)' : 'transparent',
        color: status === 'confirmed' ? 'oklch(0.2 0.04 140)' : 'var(--berry)',
        border: status === 'confirmed' ? 'none' : '1px solid var(--berry)',
      }}>
        {label}
      </button>
    </form>
  );
}

function RoundRail({ rounds, activeRoundId }: { rounds: RoundRow[]; activeRoundId: string }) {
  return (
    <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
      {rounds.map((round) => {
        const active = round.id === activeRoundId;
        return (
          <div
            key={round.id}
            className="flex min-w-[76px] flex-col items-center rounded-xl px-3 py-2 text-center"
            style={{
              background: active ? 'var(--ink)' : 'var(--paper-2)',
              color: active ? 'var(--paper)' : 'var(--ink)',
              border: `1px solid ${active ? 'var(--ink)' : 'var(--line)'}`,
            }}
          >
            <span className="mono text-sm font-bold">R{round.round_no}</span>
            <span className="mt-0.5 text-[10px] uppercase tracking-[0.08em]" style={{ color: active ? 'oklch(0.82 0.02 95)' : 'var(--ink-3)' }}>
              {round.state}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function StateButton({ tournamentId, roundId, state, label, disabled = false }: { tournamentId: string; roundId: string; state: string; label: string; disabled?: boolean }) {
  return (
    <form action={setMixerRoundState}>
      <input type="hidden" name="tournament_id" value={tournamentId} />
      <input type="hidden" name="round_id" value={roundId} />
      <input type="hidden" name="state" value={state} />
      <button disabled={disabled} className="w-full rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-ink disabled:opacity-40" style={{ border: '1px solid var(--line)' }}>
        {label}
      </button>
    </form>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-5">
      <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-3">{title}</div>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-white p-4" style={{ border: '1px solid var(--line)' }}>
      <div className="text-[10px] uppercase tracking-[0.08em] text-ink-3">{label}</div>
      <div className="mono mt-1 text-[24px] font-bold text-ink">{value}</div>
    </div>
  );
}

function Notice({ tone, children }: { tone: 'ok' | 'error'; children: ReactNode }) {
  return (
    <div className="mb-3 rounded-xl border px-3 py-2 text-sm" style={{
      borderColor: tone === 'ok' ? 'var(--court-deep)' : 'var(--berry)',
      color: tone === 'ok' ? 'var(--court-deep)' : 'var(--berry)',
      background: tone === 'ok' ? 'oklch(0.96 0.04 140)' : 'oklch(0.96 0.04 12)',
    }}>
      {children}
    </div>
  );
}

function money(value: number) {
  return `$${Math.round(value).toLocaleString()}`;
}

function formatLockDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const remainder = seconds % 3600;
  if (hours > 0 && remainder > 0) return `${hours}h ${remainder}s`;
  if (hours > 0) return `${hours}h`;
  return `${seconds}s`;
}

function normalizePrizeBuckets(value: unknown): PrizeBuckets {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { tournament: 0.5, raffle: 0.2, betting: 0.2, reserve: 0.1 };
  }
  const record = value as Record<string, unknown>;
  return {
    tournament: toFraction(record.tournament, 0.5),
    raffle: toFraction(record.raffle, 0.2),
    betting: toFraction(record.betting, 0.2),
    reserve: toFraction(record.reserve, 0.1),
  };
}

function normalizePaymentMethods(value: unknown): PaymentMethods {
  const record = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    zelle: normalizePaymentMethod(record.zelle, true),
    venmo: normalizePaymentMethod(record.venmo, false),
    cash: normalizePaymentMethod(record.cash, true),
  };
}

function normalizePaymentMethod(value: unknown, fallbackOn: boolean): PaymentMethod {
  const record = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    on: typeof record.on === 'boolean' ? record.on : fallbackOn,
    handle: typeof record.handle === 'string' ? record.handle : '',
  };
}

function toFraction(value: unknown, fallback: number) {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(1, numeric));
}
