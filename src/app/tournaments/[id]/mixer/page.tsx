import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { TopBar } from '@/components/ui/TopBar';
import { Chip } from '@/components/ui/Chip';
import { Icons } from '@/components/ui/icons';
import { BallMark } from '@/components/desktop';
import { formatInviteCode } from '@/lib/invite-codes';
import { currentMixerRound, sortMixerRounds } from '@/lib/mixer-rounds';
import { QuickJoinForm } from './QuickJoinForm';
import { PushRegistration } from './PushRegistration';
import { MixerCourtCall, MixerPresenceCheckIn } from './MixerCourtCall';
import { bindMixerRosterEntry } from './actions';
import { ActionForm } from './_components/ActionForm';
import { MixerBettingPanel } from './MixerBettingPanel';
import { MixerModeSwitch } from './MixerModeSwitch';
import { MixerRealtimeSync } from './MixerRealtimeSync';
import { MixerVotePanel } from './MixerVotePanel';
import type {
  BetRow,
  ConfigRow,
  PairingRow,
  PaymentRow,
  PlayerRow,
  RaffleItem,
  RoundRow,
  ScoreRow,
  StandingItem,
  StateRow,
  TournamentRow,
} from './_types';
import { MatchTab } from './_components/MatchTab';
import { CourtsTab } from './_components/CourtsTab';
import { MeTab } from './_components/MeTab';
import { Notice } from './_components/mixer-night';

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: 'vote' | 'match' | 'courts' | 'betting' | 'me'; round?: string; ok?: string; error?: string }>;
};

type VoteRow = {
  round_id: string;
  target_player_id: string;
  up_tokens: number;
  down_tokens: number;
};

type SnapshotRow = {
  standings: unknown;
  raffle_tickets: unknown;
  raffle_winner: unknown;
  bet_settlements: unknown;
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
    { data: member },
  ] = await Promise.all([
    supabase.from('tournaments').select('id,name,format,status,invite_code,owner_user_id,gender_mode').eq('id', id).single(),
    supabase.from('event_config').select('*').eq('tournament_id', id).maybeSingle(),
    supabase.from('mixer_rounds').select('id,round_no,state,lock_at').eq('tournament_id', id).order('round_no', { ascending: true }),
    supabase.from('tournament_players').select('id,display_name,profile_id,gender,dupr').eq('tournament_id', id).order('created_at', { ascending: true }),
    supabase.from('player_event_state').select('player_id,pairing_pool,tokens_base_remaining,tokens_bought_remaining,chips_remaining,sit_out_count,boosts_used').eq('tournament_id', id),
    user
      ? supabase.from('tournament_members').select('role').eq('tournament_id', id).eq('user_id', user.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  if (!tournament) notFound();
  const t = tournament as TournamentRow;
  if (t.format !== 'partner_mixer') notFound();

  const cfg = config as ConfigRow | null;
  const roundRows = sortMixerRounds((rounds ?? []) as RoundRow[]);
  const currentRound = currentMixerRound(roundRows);
  const requestedRoundNo = Number.parseInt(sp.round ?? '', 10);
  const voteRound = (Number.isFinite(requestedRoundNo) ? roundRows.find((r) => r.round_no === requestedRoundNo) : null) ?? currentRound;
  const roundIds = roundRows.map((r) => r.id);
  const roster = (players ?? []) as PlayerRow[];
  const stateRows = (states ?? []) as StateRow[];
  const role = (member as { role?: string } | null)?.role ?? null;
  const isManager = !!user && (user.id === t.owner_user_id || role === 'organizer' || role === 'admin' || role === 'owner');
  const myPlayer = user ? roster.find((p) => p.profile_id === user.id) ?? null : null;
  const myState = myPlayer ? stateRows.find((s) => s.player_id === myPlayer.id) ?? null : null;

  const [{ data: votes }, { data: pairings }, { data: scores }, { data: sitOuts }, { data: bets }, { data: payments }, { data: snapshot }, { data: checkIn }, { data: ballotConfirmations }] = await Promise.all([
    roundIds.length > 0 && myPlayer
      ? supabase.from('mixer_votes').select('round_id,target_player_id,up_tokens,down_tokens').in('round_id', roundIds).eq('voter_player_id', myPlayer.id)
      : Promise.resolve({ data: [] }),
    currentRound
      ? supabase.from('mixer_pairings').select('id,round_id,player_a_id,player_b_id,court_no,wave_no').eq('round_id', currentRound.id).order('court_no', { ascending: true }).order('wave_no', { ascending: true })
      : Promise.resolve({ data: [] }),
    currentRound
      ? supabase.from('mixer_scores').select('court_no,wave_no,team_a_score,team_b_score,completed_at').eq('round_id', currentRound.id)
      : Promise.resolve({ data: [] }),
    currentRound
      ? supabase.from('mixer_sit_outs').select('player_id').eq('round_id', currentRound.id)
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
    myPlayer
      ? supabase.from('mixer_check_ins').select('checked_in_at,acked_round_id').eq('tournament_id', id).eq('player_id', myPlayer.id).maybeSingle()
      : Promise.resolve({ data: null }),
    roundIds.length > 0 && myPlayer
      ? supabase.from('mixer_round_ballots').select('round_id,confirmed_at').in('round_id', roundIds).eq('player_id', myPlayer.id)
      : Promise.resolve({ data: [] }),
  ]);

  const voteRows = (votes ?? []) as VoteRow[];
  const confirmedRoundIds = ((ballotConfirmations ?? []) as { round_id: string; confirmed_at: string | null }[])
    .filter((r) => r.confirmed_at != null)
    .map((r) => r.round_id);
  const pairingRows = (pairings ?? []) as PairingRow[];
  const scoreRows = (scores ?? []) as ScoreRow[];
  const sitOutIds = ((sitOuts ?? []) as { player_id: string }[]).map((s) => s.player_id);
  const betRows = (bets ?? []) as BetRow[];
  const paymentRows = (payments ?? []) as PaymentRow[];
  const final = snapshot as SnapshotRow | null;
  const standings = Array.isArray(final?.standings) ? (final.standings as StandingItem[]) : [];
  const raffleTickets = Array.isArray(final?.raffle_tickets) ? (final.raffle_tickets as RaffleItem[]) : [];
  const raffleWinner = final?.raffle_winner && !Array.isArray(final.raffle_winner) ? (final.raffle_winner as RaffleItem) : null;
  const checkInRow = checkIn as { checked_in_at: string; acked_round_id: string | null } | null;
  const shellRound = tab === 'vote' ? (voteRound ?? currentRound) : currentRound;

  // notify.html touchpoint 2 — the in-app court-call banner. Distinct from the
  // go-time takeover (which lives in the Match tab): this is the glowing
  // "your court is ready" call that sits above every tab until the player
  // acks it with "I'm here". It shows once the draw has seated this player on
  // a court whose game isn't finished, and their check-in hasn't yet
  // acknowledged this round. Names their seat & opponents only — never picks.
  const courtCall = computeCourtCall();
  function computeCourtCall() {
    if (!myPlayer || !currentRound) return null;
    if (!['revealed', 'playing'].includes(currentRound.state)) return null;
    const mine = pairingRows.find((p) => p.player_a_id === myPlayer.id || p.player_b_id === myPlayer.id);
    if (!mine) return null;
    if (scoreRows.find((s) => s.court_no === mine.court_no && s.wave_no === mine.wave_no)?.completed_at) return null;
    if (checkInRow?.acked_round_id === currentRound.id) return null;
    const nameOf = (pid: string) => roster.find((p) => p.id === pid)?.display_name ?? 'TBD';
    const partnerId = mine.player_a_id === myPlayer.id ? mine.player_b_id : mine.player_a_id;
    const opponent = pairingRows.find((p) => p.court_no === mine.court_no && p.wave_no === mine.wave_no && p.id !== mine.id) ?? null;
    return {
      roundId: currentRound.id,
      courtNo: mine.court_no,
      waveNo: mine.wave_no,
      partnerName: nameOf(partnerId),
      opponentTeam: opponent ? `${nameOf(opponent.player_a_id)} & ${nameOf(opponent.player_b_id)}` : null,
    };
  }

  // Show the quiet presence check-in when the player is at a live event, not
  // currently court-called, and hasn't checked in yet — this is what fills the
  // present-between face-wall between rounds.
  const checkedIn = !!checkInRow?.checked_in_at;
  const eventLive = t.status === 'active';
  const showPresenceCheckIn = !!myPlayer && eventLive && !courtCall && !checkedIn;

  if (!cfg || !currentRound) {
    return <MissingSetup tournamentId={id} tournamentName={t.name} />;
  }

  if (!user) {
    return (
      <MixerShell tournament={t} currentRound={shellRound ?? currentRound} tab={tab} player={null} isManager={isManager}>
        <div className="px-[18px] pt-6">
          <div className="rounded-2xl bg-surface-card p-5" style={{ border: '1px solid var(--line)' }}>
            <div className="mono text-[10px] uppercase tracking-[0.1em] text-ink-3">You&apos;re in · {t.name}</div>
            <div className="mt-4"><QuickJoinForm tournamentId={id} inviteCode={t.invite_code} /></div>
            <Link href={`/login?next=${encodeURIComponent(`/tournaments/${id}/mixer`)}`} className="mt-3 block text-center text-[13px] font-semibold text-ink-3">
              Already have an account? Sign in →
            </Link>
          </div>
        </div>
      </MixerShell>
    );
  }

  if (!myPlayer) {
    return (
      <MixerShell tournament={t} currentRound={shellRound ?? currentRound} tab={tab} player={null} isManager={isManager}>
        <ActionForm action={bindMixerRosterEntry} className="px-[18px] pt-6">
          <input type="hidden" name="tournament_id" value={id} />
          <div className="rounded-2xl bg-surface-card p-5" style={{ border: '1px solid var(--line)' }}>
            <div className="serif text-[30px] leading-none text-ink">Claim a roster spot</div>
            <div className="mt-2 text-sm text-ink-3">We will bind this account to one tournament roster entry.</div>
            <input name="display_name" placeholder="Your display name" className="mt-4 w-full rounded-xl bg-paper-2 px-3 py-3 text-sm outline-none" style={{ border: '1px solid var(--line)' }} />
            <button className="mt-3 w-full rounded-2xl px-5 py-4 text-base font-semibold" style={{ background: 'var(--court)', color: 'var(--night-court-ink)' }}>
              Claim and vote
            </button>
          </div>
        </ActionForm>
      </MixerShell>
    );
  }

  return (
    <MixerShell tournament={t} currentRound={shellRound ?? currentRound} tab={tab} player={myPlayer} isManager={isManager}>
      <PushRegistration />
      {courtCall && (
        <MixerCourtCall
          tournamentId={id}
          roundId={courtCall.roundId}
          courtNo={courtCall.courtNo}
          waveNo={courtCall.waveNo}
          partnerName={courtCall.partnerName}
          opponentTeam={courtCall.opponentTeam}
        />
      )}
      {showPresenceCheckIn && <MixerPresenceCheckIn tournamentId={id} />}
      {sp.error && <Notice tone="error">{sp.error}</Notice>}
      {sp.ok && <Notice tone="ok">{sp.ok}</Notice>}
      {tab === 'vote' && (
        <MixerVotePanel
          tournamentId={id}
          round={voteRound ?? currentRound}
          rounds={roundRows}
          eventRoundCount={cfg.rounds}
          config={cfg}
          roster={roster}
          states={stateRows}
          myPlayer={myPlayer}
          myState={myState}
          votes={voteRows}
          confirmedRoundIds={confirmedRoundIds}
          genderMode={t.gender_mode ?? 'mixed'}
        />
      )}
      {tab === 'match' && (
        <MatchTab tournamentId={id} round={currentRound} roster={roster} pairings={pairingRows} scores={scoreRows} myPlayer={myPlayer} standings={standings} />
      )}
      {tab === 'courts' && (
        <CourtsTab roster={roster} pairings={pairingRows} scores={scoreRows} sitOuts={sitOutIds} myPlayer={myPlayer} round={currentRound} />
      )}
      {tab === 'betting' && (
        <MixerBettingPanel tournamentId={id} roster={roster} myPlayer={myPlayer} myState={myState} bets={betRows} config={cfg} />
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
  isManager,
  children,
}: {
  tournament: TournamentRow;
  currentRound: RoundRow;
  tab: string;
  player: PlayerRow | null;
  isManager: boolean;
  children: ReactNode;
}) {
  const base = `/tournaments/${tournament.id}/mixer`;
  const tabs: [string, string][] = [
    ['vote', 'Vote'],
    ['match', 'Match'],
    ['courts', 'Courts'],
    ['betting', 'Pool'],
    ['me', 'Me'],
  ];
  const href = (id: string) => (id === 'vote' ? base : `${base}?tab=${id}`);
  // Player mode is mobile-primary and widens on desktop (handoff player.html):
  // below lg the bottom tab bar drives; at lg+ a sticky sidebar takes over and
  // the mobile top chrome hides. The player surface follows the user's theme
  // (mixer-themed remaps --night-* to the live theme tokens); a bare
  // data-fullscreen keeps the themed --paper body instead of forcing dark.
  return (
    <div data-fullscreen className="mixer-themed min-h-[100dvh]" style={{ background: 'var(--night-bg)', color: 'var(--night-text)' }}>
      <MixerRealtimeSync tournamentId={tournament.id} />
      <a href="#main" className="skip-link">Skip to content</a>
      <div className="lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
        {/* Sidebar — desktop only */}
        <aside
          className="hidden lg:flex lg:h-screen lg:flex-col lg:gap-1 lg:sticky lg:top-0 lg:p-4"
          style={{ borderRight: '1px solid var(--night-line)', background: 'var(--night-nav)' }}
        >
          <div className="flex items-center gap-2.5 px-2 pb-4 pt-1.5">
            <BallMark size={26} />
            <span className="serif text-[20px]">Try to Dink</span>
          </div>
          <div className="mb-2 rounded-xl px-3 py-2.5" style={{ background: 'var(--night-card)', border: '1px solid var(--night-line)' }}>
            <div className="flex items-center gap-2 text-[13px] font-semibold">
              <Chip tone={currentRound.state === 'open' ? 'court' : 'ghost'}>{currentRound.state}</Chip>
              <span className="truncate">{tournament.name}</span>
            </div>
            <div className="mono mt-1 text-[10.5px] tracking-[0.06em]" style={{ color: 'var(--night-text3)' }}>
              ROUND {currentRound.round_no}{player ? ` · ${player.display_name.toUpperCase()}` : ''}
            </div>
          </div>
          {tabs.map(([id, label]) => (
            <Link
              key={id}
              href={href(id)}
              className="rounded-[11px] px-3 py-2.5 text-[14px] font-medium"
              style={tab === id ? { background: 'var(--court)', color: 'var(--night-court-ink)', fontWeight: 600 } : { color: 'var(--night-nav-link)' }}
            >
              {label}
            </Link>
          ))}
          <div className="flex-1" />
          {isManager && (
            <Link href={`${base}/admin`} className="rounded-[11px] px-3 py-2.5 text-[13px] font-semibold" style={{ background: 'var(--night-card)', border: '1px solid var(--night-line)', color: 'var(--night-nav-link-strong)' }}>
              Organizer mode →
            </Link>
          )}
          <Link href={`/tournaments/${tournament.id}`} className="rounded-[11px] px-3 py-2.5 text-[13px] font-medium" style={{ color: 'var(--night-text3)' }}>
            ← Back to hub
          </Link>
        </aside>

        {/* Main column — constrained on tablet, full on desktop */}
        <div className="mx-auto w-full max-w-[560px] lg:max-w-[1080px] lg:px-6">
          <div className="lg:hidden">
            <TopBar
              dark
              title={tournament.name}
              sub={`Player mode · Round ${currentRound.round_no} · ${currentRound.state}`}
              left={<Link href={`/tournaments/${tournament.id}`} className="flex h-10 w-10 items-center justify-center rounded-xl">{Icons.back}</Link>}
            />
            {isManager && <MixerModeSwitch tournamentId={tournament.id} active="player" />}
          </div>
          <div id="main" className="px-[18px] pb-3 pt-4 lg:px-0">
            <div className="flex items-center justify-between gap-3 rounded-2xl p-4" style={{ background: 'var(--night-card)', border: '1px solid var(--night-line)' }}>
              <div>
                <Chip tone={currentRound.state === 'open' ? 'court' : 'ghost'}>{currentRound.state}</Chip>
                <div className="serif mt-2 text-[28px] leading-none">Blind partner vote</div>
                <div className="mt-1 text-xs" style={{ color: 'var(--night-text2)' }}>
                  {player ? `Playing as ${player.display_name}` : `Code ${formatInviteCode(tournament.invite_code)}`}
                </div>
              </div>
              <div className="text-right">
                <div className="mono text-[22px] font-bold" style={{ color: 'var(--court)' }}>R{currentRound.round_no}</div>
                <div className="text-[10px] uppercase tracking-[0.08em]" style={{ color: 'var(--night-text3)' }}>No tallies</div>
              </div>
            </div>
          </div>
          <div className="pb-28 lg:pb-10">{children}</div>
        </div>
      </div>

      {/* Bottom tab bar — mobile only */}
      <div className="fixed bottom-0 left-0 right-0 z-30 mx-auto grid max-w-md grid-cols-5 gap-1 p-2 lg:hidden" style={{ background: 'var(--night-bg)', borderTop: '1px solid var(--night-line)' }}>
        {tabs.map(([id, label]) => (
          <Link key={id} href={href(id)} className="rounded-xl py-3 text-center text-[12px] font-bold" style={{
            background: tab === id ? 'var(--court)' : 'transparent',
            color: tab === id ? 'var(--night-court-ink)' : 'var(--night-text2)',
          }}>
            {label}
          </Link>
        ))}
      </div>
    </div>
  );
}

function MissingSetup({ tournamentId, tournamentName }: { tournamentId: string; tournamentName: string }) {
  return (
    <div className="flex min-h-full flex-col bg-paper">
      <TopBar title={tournamentName} left={<Link href={`/tournaments/${tournamentId}`}>{Icons.back}</Link>} />
      <div className="px-[18px] pt-6">
        <div className="rounded-2xl bg-surface-card p-5 text-center" style={{ border: '1px dashed var(--line)' }}>
          <div className="text-[15px] font-semibold text-ink">Mixer setup is missing</div>
          <div className="mt-1 text-xs text-ink-3">Open organizer controls to initialize the event config.</div>
          <Link href={`/tournaments/${tournamentId}/mixer/admin`} className="mt-3 inline-flex rounded-full px-4 py-2 text-[13px] font-semibold" style={{ background: 'var(--court)', color: 'var(--night-court-ink)' }}>
            Open controls →
          </Link>
        </div>
      </div>
    </div>
  );
}
