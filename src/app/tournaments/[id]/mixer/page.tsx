import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { TopBar } from '@/components/ui/TopBar';
import { Chip } from '@/components/ui/Chip';
import { Avatar, playerFromName } from '@/components/ui/Avatar';
import { Icons } from '@/components/ui/icons';
import { formatInviteCode } from '@/lib/invite-codes';
import { AnonymousMixerJoinButton } from './AnonymousMixerJoinButton';
import { bindMixerRosterEntry, placeMixerBet, requestMixerPayment, setMixerVote } from './actions';

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: 'vote' | 'match' | 'betting' | 'me'; ok?: string; error?: string }>;
};

type TournamentRow = {
  id: string;
  name: string;
  format: string;
  status: string;
  invite_code: string;
  owner_user_id: string;
};

type ConfigRow = {
  starting_tokens: number;
  starting_chips: number;
  rounds: number;
  courts: number;
  lock_mode: 'timer' | 'manual';
  lock_seconds: number;
  betting_enabled: boolean;
  raffle_enabled: boolean;
  downvotes_enabled: boolean;
  entry_fee: number;
  pay_to_play_enabled: boolean;
  boost_tokens: number;
  boost_price: number;
  boost_limit: number;
  podium_markets: number;
  betting_rake_pct: number;
  prize_buckets: unknown;
  payment_methods: unknown;
  raffle_prize: string;
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
  profile_id: string | null;
  gender: 'm' | 'f' | 'x' | null;
  dupr: number | null;
};

type StateRow = {
  player_id: string;
  pairing_pool: 'a' | 'b';
  tokens_base_remaining: number;
  tokens_bought_remaining: number;
  chips_remaining: number;
  sit_out_count: number;
  boosts_used: number;
};

type VoteRow = {
  target_player_id: string;
  up_tokens: number;
  down_tokens: number;
};

type PairingRow = {
  id: string;
  round_id: string;
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

type BetRow = {
  market_place: number;
  bettor_player_id: string;
  pick_player_id: string;
  chips: number;
};

type PaymentRow = {
  id: string;
  type: 'entry' | 'pay_to_play';
  amount: number;
  method: string;
  status: string;
};

type SnapshotRow = {
  standings: unknown;
  raffle_tickets: unknown;
  raffle_winner: unknown;
  bet_settlements: unknown;
};

type StandingItem = {
  rank: number;
  playerId: string;
  displayName: string;
  points: number;
};

type RaffleItem = {
  playerId: string;
  displayName: string;
  popularityTickets: number;
  frugalityTickets: number;
  tickets: number;
  prize?: string;
};

export default async function MixerPlayerPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const sp = await searchParams;
  const tab = sp.tab ?? 'vote';
  const supabase = await createClient();
  const user = await getCurrentUser();

  const [
    { data: tournament },
    { data: config },
    { data: rounds },
    { data: players },
    { data: states },
  ] = await Promise.all([
    supabase.from('tournaments').select('id,name,format,status,invite_code,owner_user_id').eq('id', id).single(),
    supabase.from('event_config').select('*').eq('tournament_id', id).maybeSingle(),
    supabase.from('mixer_rounds').select('id,round_no,state,lock_at').eq('tournament_id', id).order('round_no', { ascending: false }),
    supabase.from('tournament_players').select('id,display_name,profile_id,gender,dupr').eq('tournament_id', id).order('created_at', { ascending: true }),
    supabase.from('player_event_state').select('player_id,pairing_pool,tokens_base_remaining,tokens_bought_remaining,chips_remaining,sit_out_count,boosts_used').eq('tournament_id', id),
  ]);

  if (!tournament) notFound();
  const t = tournament as TournamentRow;
  if (t.format !== 'partner_mixer') notFound();

  const cfg = config as ConfigRow | null;
  const currentRound = ((rounds ?? []) as RoundRow[])[0] ?? null;
  const roster = (players ?? []) as PlayerRow[];
  const stateRows = (states ?? []) as StateRow[];
  const myPlayer = user ? roster.find((p) => p.profile_id === user.id) ?? null : null;
  const myState = myPlayer ? stateRows.find((s) => s.player_id === myPlayer.id) ?? null : null;

  const [{ data: votes }, { data: pairings }, { data: scores }, { data: bets }, { data: payments }, { data: snapshot }] = await Promise.all([
    currentRound && myPlayer
      ? supabase.from('mixer_votes').select('target_player_id,up_tokens,down_tokens').eq('round_id', currentRound.id).eq('voter_player_id', myPlayer.id)
      : Promise.resolve({ data: [] }),
    currentRound
      ? supabase.from('mixer_pairings').select('id,round_id,player_a_id,player_b_id,court_no').eq('round_id', currentRound.id).order('court_no', { ascending: true })
      : Promise.resolve({ data: [] }),
    currentRound
      ? supabase.from('mixer_scores').select('court_no,team_a_score,team_b_score,completed_at').eq('round_id', currentRound.id)
      : Promise.resolve({ data: [] }),
    myPlayer
      ? supabase.from('bets').select('market_place,bettor_player_id,pick_player_id,chips').eq('tournament_id', id).eq('bettor_player_id', myPlayer.id)
      : Promise.resolve({ data: [] }),
    myPlayer
      ? supabase.from('payments').select('id,type,amount,method,status').eq('tournament_id', id).eq('player_id', myPlayer.id).order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),
    myPlayer
      ? supabase.from('mixer_final_snapshots').select('standings,raffle_tickets,raffle_winner,bet_settlements').eq('tournament_id', id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const voteRows = (votes ?? []) as VoteRow[];
  const pairingRows = (pairings ?? []) as PairingRow[];
  const scoreRows = (scores ?? []) as ScoreRow[];
  const betRows = (bets ?? []) as BetRow[];
  const paymentRows = (payments ?? []) as PaymentRow[];
  const final = snapshot as SnapshotRow | null;
  const standings = Array.isArray(final?.standings) ? (final.standings as StandingItem[]) : [];
  const raffleTickets = Array.isArray(final?.raffle_tickets) ? (final.raffle_tickets as RaffleItem[]) : [];
  const raffleWinner = final?.raffle_winner && !Array.isArray(final.raffle_winner) ? (final.raffle_winner as RaffleItem) : null;

  if (!cfg || !currentRound) {
    return <MissingSetup tournamentId={id} tournamentName={t.name} />;
  }

  if (!user) {
    return (
      <MixerShell tournament={t} currentRound={currentRound} tab={tab} player={null}>
        <div className="px-[18px] pt-6">
          <div className="rounded-2xl bg-white p-5 text-center" style={{ border: '1px solid var(--line)' }}>
            <div className="serif text-[32px] leading-none text-ink">Jump into the Mixer</div>
            <div className="mt-2 text-sm text-ink-3">
              Join with an anonymous session now. You can upgrade later without losing tokens, bets, or pairings.
            </div>
            <div className="mt-5"><AnonymousMixerJoinButton tournamentId={id} /></div>
            <Link href={`/login?next=${encodeURIComponent(`/tournaments/${id}/mixer`)}`} className="mt-3 block text-[13px] font-semibold text-ink-3">
              Or sign in →
            </Link>
          </div>
        </div>
      </MixerShell>
    );
  }

  if (!myPlayer) {
    return (
      <MixerShell tournament={t} currentRound={currentRound} tab={tab} player={null}>
        <form action={bindMixerRosterEntry} className="px-[18px] pt-6">
          <input type="hidden" name="tournament_id" value={id} />
          <div className="rounded-2xl bg-white p-5" style={{ border: '1px solid var(--line)' }}>
            <div className="serif text-[30px] leading-none text-ink">Claim a roster spot</div>
            <div className="mt-2 text-sm text-ink-3">We will bind this account to one tournament roster entry.</div>
            <input name="display_name" placeholder="Your display name" className="mt-4 w-full rounded-xl bg-white px-3 py-3 text-sm outline-none" style={{ border: '1px solid var(--line)' }} />
            <button className="mt-3 w-full rounded-2xl px-5 py-4 text-base font-semibold" style={{ background: 'var(--court)', color: 'oklch(0.2 0.04 140)' }}>
              Claim and vote
            </button>
          </div>
        </form>
      </MixerShell>
    );
  }

  return (
    <MixerShell tournament={t} currentRound={currentRound} tab={tab} player={myPlayer}>
      {sp.error && <Notice tone="error">{sp.error}</Notice>}
      {sp.ok && <Notice tone="ok">{sp.ok}</Notice>}
      {tab === 'vote' && (
        <VoteTab
          tournamentId={id}
          round={currentRound}
          config={cfg}
          roster={roster}
          states={stateRows}
          myPlayer={myPlayer}
          myState={myState}
          votes={voteRows}
        />
      )}
      {tab === 'match' && (
        <MatchTab roster={roster} pairings={pairingRows} scores={scoreRows} myPlayer={myPlayer} standings={standings} />
      )}
      {tab === 'betting' && (
        <BettingTab tournamentId={id} roster={roster} myPlayer={myPlayer} myState={myState} bets={betRows} config={cfg} />
      )}
      {tab === 'me' && (
        <MeTab tournament={t} config={cfg} player={myPlayer} state={myState} inviteCode={t.invite_code} payments={paymentRows} raffleTickets={raffleTickets} raffleWinner={raffleWinner} standings={standings} />
      )}
    </MixerShell>
  );
}

function MixerShell({
  tournament,
  currentRound,
  tab,
  player,
  children,
}: {
  tournament: TournamentRow;
  currentRound: RoundRow;
  tab: string;
  player: PlayerRow | null;
  children: ReactNode;
}) {
  const base = `/tournaments/${tournament.id}/mixer`;
  const tabs = [
    ['vote', 'Vote'],
    ['match', 'Match'],
    ['betting', 'Pool'],
    ['me', 'Me'],
  ];
  return (
    <div className="flex min-h-[100dvh] flex-col" style={{ background: 'oklch(0.155 0.024 264)', color: 'oklch(0.975 0.012 264)' }}>
      <TopBar
        dark
        title={tournament.name}
        sub={`Partner Mixer · Round ${currentRound.round_no} · ${currentRound.state}`}
        left={<Link href="/tournaments" className="flex h-10 w-10 items-center justify-center rounded-xl">{Icons.back}</Link>}
        right={<Link href={`/tournaments/${tournament.id}/mixer/admin`} className="flex h-10 w-10 items-center justify-center rounded-xl">{Icons.more}</Link>}
      />
      <div className="px-[18px] pb-3">
        <div className="flex items-center justify-between gap-3 rounded-2xl p-4" style={{ background: 'oklch(0.215 0.03 264)', border: '1px solid oklch(0.36 0.04 266)' }}>
          <div>
            <Chip tone={currentRound.state === 'open' ? 'court' : 'ghost'}>{currentRound.state}</Chip>
            <div className="serif mt-2 text-[28px] leading-none">Blind partner vote</div>
            <div className="mt-1 text-xs" style={{ color: 'oklch(0.78 0.028 264)' }}>
              {player ? `Playing as ${player.display_name}` : `Code ${formatInviteCode(tournament.invite_code)}`}
            </div>
          </div>
          <div className="text-right">
            <div className="mono text-[22px] font-bold" style={{ color: 'var(--court)' }}>R{currentRound.round_no}</div>
            <div className="text-[10px] uppercase tracking-[0.08em]" style={{ color: 'oklch(0.7 0.03 264)' }}>No tallies</div>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto pb-24">{children}</div>
      <div className="fixed bottom-0 left-0 right-0 mx-auto grid max-w-md grid-cols-4 gap-1 p-2" style={{ background: 'oklch(0.155 0.024 264)', borderTop: '1px solid oklch(0.36 0.04 266)' }}>
        {tabs.map(([id, label]) => (
          <Link key={id} href={id === 'vote' ? base : `${base}?tab=${id}`} className="rounded-xl py-3 text-center text-[12px] font-bold" style={{
            background: tab === id ? 'var(--court)' : 'transparent',
            color: tab === id ? 'oklch(0.2 0.04 140)' : 'oklch(0.78 0.028 264)',
          }}>
            {label}
          </Link>
        ))}
      </div>
    </div>
  );
}

function VoteTab({
  tournamentId,
  round,
  config,
  roster,
  states,
  myPlayer,
  myState,
  votes,
}: {
  tournamentId: string;
  round: RoundRow;
  config: ConfigRow;
  roster: PlayerRow[];
  states: StateRow[];
  myPlayer: PlayerRow;
  myState: StateRow | null;
  votes: VoteRow[];
}) {
  const poolFor = (player: PlayerRow): 'a' | 'b' => (player.gender === 'f' ? 'b' : 'a');
  const myPool = states.find((s) => s.player_id === myPlayer.id)?.pairing_pool ?? poolFor(myPlayer);
  const targets = roster.filter((p) => p.id !== myPlayer.id && poolFor(p) !== myPool);
  const spent = votes.reduce((s, v) => s + v.up_tokens + v.down_tokens, 0);
  const remaining = (myState?.tokens_base_remaining ?? config.starting_tokens) + (myState?.tokens_bought_remaining ?? 0);
  const budget = remaining + spent;
  const left = remaining;
  const locked = round.state !== 'open';
  return (
    <div className="px-[18px]">
      <div className="mb-3 rounded-2xl p-4" style={{ background: 'oklch(0.215 0.03 264)', border: '1px solid oklch(0.36 0.04 266)' }}>
        <div className="flex items-center justify-between">
          <div className="text-[11px] uppercase tracking-[0.08em]" style={{ color: 'oklch(0.7 0.03 264)' }}>Token budget</div>
          <div className="mono text-[22px] font-bold" style={{ color: 'var(--court)' }}>{left}/{budget}</div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1">
          {Array.from({ length: budget }).map((_, i) => (
            <span key={i} className="h-4 w-4 rounded-full" style={{ background: i < left ? 'var(--court)' : 'transparent', border: i < left ? 'none' : '1px dashed oklch(0.36 0.04 266)' }} />
          ))}
        </div>
      </div>
      {locked && (
        <div className="mb-3 rounded-2xl p-3 text-sm" style={{ background: 'oklch(0.215 0.03 264)', color: 'oklch(0.78 0.028 264)', border: '1px solid oklch(0.36 0.04 266)' }}>
          Voting is locked. Your choices are sealed; no raw tallies are exposed.
        </div>
      )}
      <div className="grid gap-2.5">
        {targets.map((p) => {
          const vote = votes.find((v) => v.target_player_id === p.id) ?? { up_tokens: 0, down_tokens: 0 };
          return (
            <form key={p.id} action={setMixerVote} className="rounded-2xl p-3" style={{ background: 'oklch(0.215 0.03 264)', border: '1px solid oklch(0.36 0.04 266)' }}>
              <input type="hidden" name="tournament_id" value={tournamentId} />
              <input type="hidden" name="round_id" value={round.id} />
              <input type="hidden" name="voter_player_id" value={myPlayer.id} />
              <input type="hidden" name="target_player_id" value={p.id} />
              <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
                <Avatar player={playerFromName(p.display_name)} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold">{p.display_name}</div>
                  <div className="mono text-[11px]" style={{ color: 'oklch(0.7 0.03 264)' }}>DUPR {p.dupr ?? '—'}</div>
                </div>
                <div className="flex items-center gap-1">
                  <input name="up_tokens" type="number" min={0} max={budget} defaultValue={vote.up_tokens} disabled={locked} className="mono h-10 w-11 rounded-xl text-center text-ink" />
                  {config.downvotes_enabled && <input name="down_tokens" type="number" min={0} max={budget} defaultValue={vote.down_tokens} disabled={locked} className="mono h-10 w-11 rounded-xl text-center text-ink" />}
                  <button disabled={locked} className="h-10 rounded-xl px-2 text-xs font-bold disabled:opacity-40" style={{ background: 'var(--court)', color: 'oklch(0.2 0.04 140)' }}>Save</button>
                </div>
              </div>
            </form>
          );
        })}
      </div>
    </div>
  );
}

function MatchTab({ roster, pairings, scores, myPlayer, standings }: { roster: PlayerRow[]; pairings: PairingRow[]; scores: ScoreRow[]; myPlayer: PlayerRow; standings: StandingItem[] }) {
  const myPairing = pairings.find((p) => p.player_a_id === myPlayer.id || p.player_b_id === myPlayer.id);
  if (standings.length > 0) {
    return <FinalStandingsNight standings={standings} myPlayer={myPlayer} />;
  }
  const name = (id: string) => roster.find((p) => p.id === id)?.display_name ?? 'TBD';
  if (!myPairing) {
    return <EmptyNight title="No pairing yet" body="When the organizer draws this round, your court and partner land here." />;
  }
  const courtTeams = pairings.filter((p) => p.court_no === myPairing.court_no);
  const myTeamIndex = Math.max(0, courtTeams.findIndex((p) => p.id === myPairing.id));
  const opponent = courtTeams.find((p) => p.id !== myPairing.id);
  const score = scores.find((s) => s.court_no === myPairing.court_no);
  const myScore = !score ? 0 : myTeamIndex === 0 ? score.team_a_score : score.team_b_score;
  const theirScore = !score ? 0 : myTeamIndex === 0 ? score.team_b_score : score.team_a_score;
  return (
    <div className="px-[18px]">
      <div className="rounded-[18px] p-5" style={{ background: 'oklch(0.215 0.03 264)', border: '1px solid oklch(0.36 0.04 266)' }}>
        <div className="text-[11px] uppercase tracking-[0.08em]" style={{ color: 'var(--court)' }}>Your team</div>
        <div className="serif mt-2 text-[32px] leading-none">
          {name(myPairing.player_a_id)} & {name(myPairing.player_b_id)}
        </div>
        <div className="mt-2 text-sm" style={{ color: 'oklch(0.78 0.028 264)' }}>Court {myPairing.court_no}</div>
        {opponent && (
          <div className="mt-3 text-sm" style={{ color: 'oklch(0.78 0.028 264)' }}>
            vs {name(opponent.player_a_id)} & {name(opponent.player_b_id)}
          </div>
        )}
      </div>
      <div className="mt-3 rounded-[18px] p-5 text-center" style={{ background: 'oklch(0.215 0.03 264)', border: '1px solid oklch(0.36 0.04 266)' }}>
        <div className="text-[11px] uppercase tracking-[0.08em]" style={{ color: 'oklch(0.7 0.03 264)' }}>Score</div>
        <div className="mono mt-2 text-[54px] font-bold" style={{ color: 'var(--court)' }}>{myScore}-{theirScore}</div>
      </div>
      <StandingsMini roster={roster} pairings={pairings} scores={scores} />
    </div>
  );
}

function BettingTab({ tournamentId, roster, myPlayer, myState, bets, config }: { tournamentId: string; roster: PlayerRow[]; myPlayer: PlayerRow; myState: StateRow | null; bets: BetRow[]; config: ConfigRow }) {
  if (!config.betting_enabled) return <EmptyNight title="Pool is off" body="This Mixer is running without podium pools." />;
  const markets = Array.from({ length: Math.max(1, Math.min(config.podium_markets ?? 3, 8)) }, (_, i) => i + 1);
  return (
    <div className="px-[18px]">
      <div className="mb-3 flex items-center justify-between">
        <div className="serif text-[30px]">Podium pools</div>
        <div className="mono text-sm" style={{ color: 'oklch(0.78 0.028 264)' }}>chips {myState?.chips_remaining ?? 0}</div>
      </div>
      <div className="mb-3 rounded-2xl p-3 text-xs leading-5" style={{ background: 'oklch(0.215 0.03 264)', color: 'oklch(0.78 0.028 264)', border: '1px solid oklch(0.36 0.04 266)' }}>
        Markets close when the event is finalized. Rake: {Math.round(Number(config.betting_rake_pct ?? 0) * 100)}%. Winnings return as chips.
      </div>
      {markets.map((place) => (
        <div key={place} className="mb-3 rounded-2xl p-4" style={{ background: 'oklch(0.215 0.03 264)', border: '1px solid oklch(0.36 0.04 266)' }}>
          <div className="font-bold">{ordinal(place)} place market</div>
          <div className="mt-3 grid gap-2">
            {roster.map((p) => {
              const mine = bets.find((b) => b.market_place === place && b.pick_player_id === p.id);
              return (
                <form key={p.id} action={placeMixerBet} className="flex items-center gap-2 rounded-xl p-2" style={{ background: 'oklch(0.285 0.038 266)' }}>
                  <input type="hidden" name="tournament_id" value={tournamentId} />
                  <input type="hidden" name="bettor_player_id" value={myPlayer.id} />
                  <input type="hidden" name="pick_player_id" value={p.id} />
                  <input type="hidden" name="market_place" value={place} />
                  <Avatar player={playerFromName(p.display_name)} size={30} />
                  <div className="flex-1 text-sm font-semibold">{p.id === myPlayer.id ? 'You' : p.display_name}</div>
                  <input name="chips" type="number" min={1} max={1000} defaultValue={mine?.chips ?? 10} className="mono h-9 w-14 rounded-lg text-center text-ink" />
                  <button className="h-9 rounded-lg px-3 text-xs font-bold" style={{ background: mine ? 'var(--court)' : 'transparent', color: mine ? 'oklch(0.2 0.04 140)' : 'var(--court)', border: mine ? 'none' : '1px solid var(--court)' }}>{mine ? 'Edit' : 'Bet'}</button>
                </form>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function MeTab({
  tournament,
  config,
  player,
  state,
  inviteCode,
  payments,
  raffleTickets,
  raffleWinner,
  standings,
}: {
  tournament: TournamentRow;
  config: ConfigRow;
  player: PlayerRow;
  state: StateRow | null;
  inviteCode: string;
  payments: PaymentRow[];
  raffleTickets: RaffleItem[];
  raffleWinner: RaffleItem | null;
  standings: StandingItem[];
}) {
  const entry = payments.find((p) => p.type === 'entry');
  const boost = payments.find((p) => p.type === 'pay_to_play');
  const boostUsed = (state?.boosts_used ?? 0) > 0;
  const methods = normalizePaymentMethods(config.payment_methods);
  const primaryMethod = firstEnabledPaymentMethod(methods);
  const myTickets = raffleTickets.find((r) => r.playerId === player.id);
  const myStanding = standings.find((s) => s.playerId === player.id);
  const wonRaffle = raffleWinner?.playerId === player.id;
  return (
    <div className="px-[18px]">
      <div className="rounded-2xl p-5" style={{ background: 'oklch(0.215 0.03 264)', border: '1px solid oklch(0.36 0.04 266)' }}>
        <div className="flex items-center gap-3">
          <Avatar player={playerFromName(player.display_name)} size={56} />
          <div>
            <div className="serif text-[30px] leading-none">{player.display_name}</div>
            <div className="mt-1 text-xs" style={{ color: 'oklch(0.78 0.028 264)' }}>{tournament.name}</div>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Stat label="Tokens" value={(state?.tokens_base_remaining ?? config.starting_tokens) + (state?.tokens_bought_remaining ?? 0)} />
          <Stat label="Chips" value={state?.chips_remaining ?? config.starting_chips} />
          <Stat label="Raffle" value={myTickets ? Math.round(myTickets.tickets * 10) / 10 : '—'} />
          <Stat label="Standing" value={myStanding ? `#${myStanding.rank}` : 'Live'} />
          <Stat label="Entry fee" value={`$${config.entry_fee}`} />
          <Stat label="Code" value={formatInviteCode(inviteCode)} />
        </div>
      </div>
      {raffleWinner && (
        <div className="mt-3 rounded-2xl p-5" style={{ background: wonRaffle ? 'color-mix(in oklch, var(--court) 22%, oklch(0.215 0.03 264))' : 'oklch(0.215 0.03 264)', border: wonRaffle ? '1px solid var(--court)' : '1px solid oklch(0.36 0.04 266)' }}>
          <div className="text-[11px] uppercase tracking-[0.08em]" style={{ color: 'var(--court)' }}>Raffle winner</div>
          <div className="serif mt-2 text-[30px] leading-none">{wonRaffle ? 'You won' : raffleWinner.displayName}</div>
          <div className="mt-1 text-sm" style={{ color: 'oklch(0.78 0.028 264)' }}>
            {raffleWinner.prize ?? config.raffle_prize} · {Math.round(Number(raffleWinner.tickets ?? 0) * 10) / 10} tickets
          </div>
        </div>
      )}
      <div className="mt-3 rounded-2xl p-5" style={{ background: 'oklch(0.215 0.03 264)', border: '1px solid oklch(0.36 0.04 266)' }}>
        <div className="serif text-[28px] leading-none">Payments</div>
        <div className="mt-1 text-xs" style={{ color: 'oklch(0.78 0.028 264)' }}>Manual records only. Organizers confirm them from controls.</div>
        <div className="mt-3 grid gap-2">
          {paymentMethodRows(methods).map((m) => (
            <div key={m.key} className="rounded-xl px-3 py-2 text-sm" style={{ background: 'oklch(0.285 0.038 266)' }}>
              <div className="font-bold">{m.label}</div>
              <div className="mono mt-1 text-xs" style={{ color: 'oklch(0.78 0.028 264)' }}>{m.handle || 'Pay organizer in person'} · memo: {player.display_name}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-3">
          <PaymentRequest
            tournamentId={tournament.id}
            playerId={player.id}
            type="entry"
            title="Entry"
            amount={config.entry_fee}
            method={primaryMethod}
            status={entry?.status}
            disabled={!!entry && entry.status !== 'refunded'}
          />
          {config.pay_to_play_enabled && (
            <PaymentRequest
              tournamentId={tournament.id}
              playerId={player.id}
              type="pay_to_play"
              title={`+${config.boost_tokens} token boost`}
              amount={config.boost_price}
              method={primaryMethod}
              status={boost?.status ?? (boostUsed ? 'confirmed' : undefined)}
              disabled={boostUsed || (state?.boosts_used ?? 0) >= config.boost_limit || (!!boost && boost.status !== 'refunded')}
            />
          )}
        </div>
        {myTickets && (
          <div className="mt-4 rounded-xl p-3 text-sm" style={{ background: 'oklch(0.285 0.038 266)' }}>
            <div className="font-bold">Raffle ticket math</div>
            <div className="mt-1 text-xs leading-5" style={{ color: 'oklch(0.78 0.028 264)' }}>
              Popularity {Math.round(myTickets.popularityTickets * 10) / 10} + unused base token bonus {Math.round(myTickets.frugalityTickets * 10) / 10}. Bought tokens do not count.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PaymentRequest({
  tournamentId,
  playerId,
  type,
  title,
  amount,
  method,
  status,
  disabled,
}: {
  tournamentId: string;
  playerId: string;
  type: 'entry' | 'pay_to_play';
  title: string;
  amount: number;
  method: string;
  status?: string;
  disabled: boolean;
}) {
  return (
    <form action={requestMixerPayment} className="rounded-xl p-3" style={{ background: 'oklch(0.285 0.038 266)' }}>
      <input type="hidden" name="tournament_id" value={tournamentId} />
      <input type="hidden" name="player_id" value={playerId} />
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="method" value={method} />
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-bold">{title}</div>
          <div className="mono mt-1 text-xs" style={{ color: 'oklch(0.78 0.028 264)' }}>${amount} · {status ?? 'not requested'}</div>
        </div>
        <button disabled={disabled} className="rounded-xl px-3 py-2 text-xs font-bold disabled:opacity-40" style={{ background: 'var(--court)', color: 'oklch(0.2 0.04 140)' }}>
          Request
        </button>
      </div>
    </form>
  );
}

function StandingsMini({ roster, pairings, scores }: { roster: PlayerRow[]; pairings: PairingRow[]; scores: ScoreRow[] }) {
  const points = new Map<string, number>();
  const name = (id: string) => roster.find((p) => p.id === id)?.display_name ?? 'TBD';
  const byCourt = new Map<number, PairingRow[]>();
  for (const p of pairings) byCourt.set(p.court_no, [...(byCourt.get(p.court_no) ?? []), p]);
  for (const [courtNo, teams] of byCourt) {
    const s = scores.find((row) => row.court_no === courtNo);
    if (!s) continue;
    const teamA = teams[0];
    const teamB = teams[1];
    if (teamA) {
      points.set(teamA.player_a_id, (points.get(teamA.player_a_id) ?? 0) + s.team_a_score);
      points.set(teamA.player_b_id, (points.get(teamA.player_b_id) ?? 0) + s.team_a_score);
    }
    if (teamB) {
      points.set(teamB.player_a_id, (points.get(teamB.player_a_id) ?? 0) + s.team_b_score);
      points.set(teamB.player_b_id, (points.get(teamB.player_b_id) ?? 0) + s.team_b_score);
    }
  }
  const rows = [...points.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (rows.length === 0) return null;
  return (
    <div className="mt-3 rounded-2xl p-4" style={{ background: 'oklch(0.215 0.03 264)', border: '1px solid oklch(0.36 0.04 266)' }}>
      <div className="serif mb-2 text-[24px]">Live standings</div>
      {rows.map(([id, pts], i) => (
        <div key={id} className="flex items-center justify-between py-2">
          <div className="text-sm">{i + 1}. {name(id)}</div>
          <div className="mono text-sm" style={{ color: 'var(--court)' }}>{pts}</div>
        </div>
      ))}
    </div>
  );
}

function FinalStandingsNight({ standings, myPlayer }: { standings: StandingItem[]; myPlayer: PlayerRow }) {
  return (
    <div className="px-[18px]">
      <div className="mb-3 rounded-2xl p-5" style={{ background: 'oklch(0.215 0.03 264)', border: '1px solid oklch(0.36 0.04 266)' }}>
        <div className="text-[11px] uppercase tracking-[0.08em]" style={{ color: 'var(--court)' }}>Final standings</div>
        <div className="serif mt-2 text-[34px] leading-none">Mixer complete</div>
        <div className="mt-1 text-sm" style={{ color: 'oklch(0.78 0.028 264)' }}>Podium markets and raffle are settled from these results.</div>
      </div>
      <div className="grid gap-2">
        {standings.slice(0, 12).map((row) => {
          const me = row.playerId === myPlayer.id;
          return (
            <div key={row.playerId} className="flex items-center justify-between rounded-2xl p-3" style={{ background: me ? 'color-mix(in oklch, var(--court) 18%, oklch(0.215 0.03 264))' : 'oklch(0.215 0.03 264)', border: me ? '1px solid var(--court)' : '1px solid oklch(0.36 0.04 266)' }}>
              <div>
                <div className="text-[11px] uppercase tracking-[0.08em]" style={{ color: 'oklch(0.7 0.03 264)' }}>{ordinal(row.rank)}</div>
                <div className="text-sm font-bold">{me ? 'You' : row.displayName}</div>
              </div>
              <div className="mono text-xl font-bold" style={{ color: 'var(--court)' }}>{row.points}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl p-3" style={{ background: 'oklch(0.285 0.038 266)' }}>
      <div className="text-[10px] uppercase tracking-[0.08em]" style={{ color: 'oklch(0.7 0.03 264)' }}>{label}</div>
      <div className="mono mt-1 text-[22px] font-bold" style={{ color: 'var(--court)' }}>{value}</div>
    </div>
  );
}

type PaymentMethod = {
  on: boolean;
  handle: string;
};

type PaymentMethods = {
  zelle: PaymentMethod;
  venmo: PaymentMethod;
  cash: PaymentMethod;
};

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

function paymentMethodRows(methods: PaymentMethods) {
  return [
    methods.zelle.on ? { key: 'zelle', label: 'Zelle', handle: methods.zelle.handle } : null,
    methods.venmo.on ? { key: 'venmo', label: 'Venmo', handle: methods.venmo.handle ? `@${methods.venmo.handle.replace(/^@/, '')}` : '' } : null,
    methods.cash.on ? { key: 'cash', label: 'Cash', handle: '' } : null,
  ].filter((row): row is { key: string; label: string; handle: string } => !!row);
}

function firstEnabledPaymentMethod(methods: PaymentMethods) {
  if (methods.zelle.on) return 'zelle';
  if (methods.venmo.on) return 'venmo';
  return 'cash';
}

function ordinal(n: number) {
  const suffix = n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th';
  return `${n}${suffix}`;
}

function Notice({ tone, children }: { tone: 'ok' | 'error'; children: ReactNode }) {
  return (
    <div className="mx-[18px] mb-3 rounded-xl px-3 py-2 text-sm" style={{
      color: tone === 'ok' ? 'var(--court)' : 'var(--serve)',
      background: 'oklch(0.215 0.03 264)',
      border: '1px solid oklch(0.36 0.04 266)',
    }}>
      {children}
    </div>
  );
}

function EmptyNight({ title, body }: { title: string; body: string }) {
  return (
    <div className="px-[18px] pt-6">
      <div className="rounded-2xl p-6 text-center" style={{ background: 'oklch(0.215 0.03 264)', border: '1px dashed oklch(0.36 0.04 266)' }}>
        <div className="serif text-[30px] leading-none">{title}</div>
        <div className="mt-2 text-sm" style={{ color: 'oklch(0.78 0.028 264)' }}>{body}</div>
      </div>
    </div>
  );
}

function MissingSetup({ tournamentId, tournamentName }: { tournamentId: string; tournamentName: string }) {
  return (
    <div className="flex min-h-full flex-col bg-paper">
      <TopBar title={tournamentName} left={<Link href={`/tournaments/${tournamentId}`}>{Icons.back}</Link>} />
      <div className="px-[18px] pt-6">
        <div className="rounded-2xl bg-white p-5 text-center" style={{ border: '1px dashed var(--line)' }}>
          <div className="text-[15px] font-semibold text-ink">Mixer setup is missing</div>
          <div className="mt-1 text-xs text-ink-3">Open organizer controls to initialize the event config.</div>
          <Link href={`/tournaments/${tournamentId}/mixer/admin`} className="mt-3 inline-flex rounded-full px-4 py-2 text-[13px] font-semibold" style={{ background: 'var(--court)', color: 'oklch(0.2 0.04 140)' }}>
            Open controls →
          </Link>
        </div>
      </div>
    </div>
  );
}
