import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { TopBar } from '@/components/ui/TopBar';
import { Icons } from '@/components/ui/icons';
import { currentMixerRound } from '@/lib/mixer-rounds';
import { MixerModeSwitch } from '../MixerModeSwitch';
import { MixerRealtimeSync } from '../MixerRealtimeSync';
import { MixerPresentationTakeover } from './MixerPresentationTakeover';
import { MixerReveal, type RevealCourt } from './MixerReveal';

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ style?: string }>;
};

type TournamentRow = {
  id: string;
  name: string;
  format: string;
  status: string;
};

type RoundRow = {
  id: string;
  round_no: number;
  state: string;
};

type PlayerRow = {
  id: string;
  display_name: string;
  dupr: number | null;
};

type PairingRow = {
  id: string;
  player_a_id: string;
  player_b_id: string;
  court_no: number;
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
  tickets: number;
};

type SettlementItem = {
  bettorPlayerId: string;
  marketPlace: number;
  payout: number;
};

type SitOutRow = {
  player_id: string;
};

type ConfigRow = {
  raffle_prize: string;
  betting_rake_pct: number;
  podium_markets: number;
};

export default async function MixerPresentPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const sp = await searchParams;
  const variant: 'board' | 'stage' = sp.style === 'stage' ? 'stage' : 'board';
  const supabase = await createClient();
  const [{ data: tournament }, { data: rounds }, { data: players }, { data: snapshot }, { data: config }] = await Promise.all([
    supabase.from('tournaments').select('id,name,format,status').eq('id', id).single(),
    supabase.from('mixer_rounds').select('id,round_no,state').eq('tournament_id', id).order('round_no', { ascending: true }),
    supabase.from('tournament_players').select('id,display_name,dupr').eq('tournament_id', id),
    supabase.from('mixer_final_snapshots').select('standings,raffle_tickets,raffle_winner,bet_settlements').eq('tournament_id', id).maybeSingle(),
    supabase.from('event_config').select('raffle_prize,betting_rake_pct,podium_markets').eq('tournament_id', id).maybeSingle(),
  ]);

  if (!tournament) notFound();
  const t = tournament as TournamentRow;
  if (t.format !== 'partner_mixer') notFound();
  const roundList = (rounds ?? []) as RoundRow[];
  const round = currentMixerRound(roundList);
  const roster = (players ?? []) as PlayerRow[];
  const [{ data: pairings }, { data: sitOuts }, { count: voteCount }] = round
    ? await Promise.all([
        supabase.from('mixer_pairings').select('id,player_a_id,player_b_id,court_no').eq('round_id', round.id).order('court_no', { ascending: true }),
        supabase.from('mixer_sit_outs').select('player_id').eq('round_id', round.id),
        supabase.from('mixer_votes').select('id', { count: 'exact', head: true }).eq('round_id', round.id),
      ])
    : [{ data: [] }, { data: [] }, { count: 0 }];
  const pairingRows = (pairings ?? []) as PairingRow[];
  const sitOutRows = (sitOuts ?? []) as SitOutRow[];
  const final = snapshot as SnapshotRow | null;
  const cfg = config as ConfigRow | null;
  const standings = Array.isArray(final?.standings) ? (final.standings as StandingItem[]) : [];
  const raffle = Array.isArray(final?.raffle_tickets) ? (final.raffle_tickets as RaffleItem[]) : [];
  const raffleWinner = final?.raffle_winner && !Array.isArray(final.raffle_winner) ? (final.raffle_winner as RaffleItem & { prize?: string }) : null;
  const settlements = Array.isArray(final?.bet_settlements) ? (final.bet_settlements as SettlementItem[]) : [];
  const totalTickets = raffle.reduce((sum, row) => sum + Number(row.tickets ?? 0), 0);

  // Reveal state: pairings are drawn and the event is not yet finalized. This
  // is the projector "reveal moment" (handoff present-a/present-b) — a pure
  // full-screen show stage. Final (snapshot) and pre-draw states keep the
  // organizer chrome below.
  const nameOf = (pid: string) => roster.find((p) => p.id === pid);
  const revealCourts: RevealCourt[] = (() => {
    const byCourt = new Map<number, PairingRow[]>();
    for (const p of pairingRows) byCourt.set(p.court_no, [...(byCourt.get(p.court_no) ?? []), p]);
    const toPlayers = (pair: PairingRow | undefined) =>
      pair
        ? [pair.player_a_id, pair.player_b_id].map((pid) => {
            const pl = nameOf(pid);
            return { id: pid, name: pl?.display_name ?? 'TBD', dupr: pl?.dupr ?? null };
          })
        : [];
    return [...byCourt.entries()]
      .filter(([, teams]) => teams.length >= 2)
      .sort((a, b) => a[0] - b[0])
      .map(([courtNo, teams]) => ({ courtNo, teamA: toPlayers(teams[0]), teamB: toPlayers(teams[1]) }));
  })();
  const isReveal = standings.length === 0 && revealCourts.length > 0;

  if (isReveal) {
    const seated = new Set<string>();
    for (const c of revealCourts) for (const pl of [...c.teamA, ...c.teamB]) seated.add(pl.id);
    return (
      <MixerReveal
        tournamentId={id}
        variant={variant}
        eventName={t.name}
        roundNo={round?.round_no ?? 1}
        courts={revealCourts}
        pool={roster.map((p) => p.display_name)}
        tokensCast={voteCount ?? 0}
        playersIn={seated.size}
        teamsToDraw={revealCourts.length * 2}
      />
    );
  }

  return (
    <div className="relative left-1/2 flex min-h-full w-[calc(100vw-15px)] -translate-x-1/2 flex-col overflow-hidden" style={{ background: 'var(--night-bg)', color: 'var(--night-text)' }}>
      <MixerRealtimeSync tournamentId={id} />
      <TopBar
        dark
        title={t.name}
        sub={round ? `Round ${round.round_no} · ${round.state}` : 'Presentation'}
        left={<Link href={`/tournaments/${id}`} className="flex h-10 w-10 items-center justify-center rounded-xl">{Icons.back}</Link>}
      />
      <MixerModeSwitch tournamentId={id} active="present" />
      <div className="px-8 pt-3">
        <Link
          href={`/tournaments/${id}/mixer/present/between`}
          className="mono inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] uppercase tracking-[0.08em]"
          style={{ background: 'var(--night-card)', border: '1px solid var(--night-line)', color: 'var(--court)' }}
        >
          Between-rounds board →
        </Link>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center px-8 pb-10 text-center">
        <MixerPresentationTakeover
          round={round}
          roster={roster}
          pairings={pairingRows}
          sitOuts={sitOutRows}
          standings={standings}
          raffleWinner={raffleWinner}
          settlements={settlements}
          config={cfg}
          totalTickets={totalTickets}
        />
      </div>
    </div>
  );
}
