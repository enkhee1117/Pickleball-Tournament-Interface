import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { TopBar } from '@/components/ui/TopBar';
import { Icons } from '@/components/ui/icons';
import { MixerModeSwitch } from '../MixerModeSwitch';

type PageProps = {
  params: Promise<{ id: string }>;
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

export default async function MixerPresentPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: tournament }, { data: rounds }, { data: players }, { data: snapshot }, { data: config }] = await Promise.all([
    supabase.from('tournaments').select('id,name,format,status').eq('id', id).single(),
    supabase.from('mixer_rounds').select('id,round_no,state').eq('tournament_id', id).order('round_no', { ascending: false }),
    supabase.from('tournament_players').select('id,display_name').eq('tournament_id', id),
    supabase.from('mixer_final_snapshots').select('standings,raffle_tickets,raffle_winner,bet_settlements').eq('tournament_id', id).maybeSingle(),
    supabase.from('event_config').select('raffle_prize,betting_rake_pct,podium_markets').eq('tournament_id', id).maybeSingle(),
  ]);

  if (!tournament) notFound();
  const t = tournament as TournamentRow;
  if (t.format !== 'partner_mixer') notFound();
  const round = ((rounds ?? []) as RoundRow[])[0] ?? null;
  const roster = (players ?? []) as PlayerRow[];
  const [{ data: pairings }, { data: sitOuts }] = round
    ? await Promise.all([
        supabase.from('mixer_pairings').select('id,player_a_id,player_b_id,court_no').eq('round_id', round.id).order('court_no', { ascending: true }),
        supabase.from('mixer_sit_outs').select('player_id').eq('round_id', round.id),
      ])
    : [{ data: [] }, { data: [] }];
  const pairingRows = (pairings ?? []) as PairingRow[];
  const sitOutRows = (sitOuts ?? []) as SitOutRow[];
  const final = snapshot as SnapshotRow | null;
  const cfg = config as ConfigRow | null;
  const standings = Array.isArray(final?.standings) ? (final.standings as StandingItem[]) : [];
  const raffle = Array.isArray(final?.raffle_tickets) ? (final.raffle_tickets as RaffleItem[]) : [];
  const raffleWinner = final?.raffle_winner && !Array.isArray(final.raffle_winner) ? (final.raffle_winner as RaffleItem & { prize?: string }) : null;
  const settlements = Array.isArray(final?.bet_settlements) ? (final.bet_settlements as SettlementItem[]) : [];
  const name = (playerId: string) => roster.find((p) => p.id === playerId)?.display_name ?? 'TBD';
  const courts = [...new Set(pairingRows.map((p) => p.court_no))];
  const totalTickets = raffle.reduce((sum, row) => sum + Number(row.tickets ?? 0), 0);

  return (
    <div className="relative left-1/2 flex min-h-full w-[calc(100vw-15px)] -translate-x-1/2 flex-col overflow-hidden" style={{ background: 'oklch(0.155 0.024 264)', color: 'oklch(0.975 0.012 264)' }}>
      <TopBar
        dark
        title={t.name}
        sub={round ? `Round ${round.round_no} · ${round.state}` : 'Presentation'}
        left={<Link href={`/tournaments/${id}`} className="flex h-10 w-10 items-center justify-center rounded-xl">{Icons.back}</Link>}
      />
      <MixerModeSwitch tournamentId={id} active="present" />
      <div className="flex flex-1 flex-col items-center justify-center px-8 pb-10 text-center">
        {standings.length > 0 ? (
          <div className="w-full max-w-6xl">
            <div className="text-[12px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--court)' }}>Final results</div>
            <div className="serif mt-2 text-[58px] leading-none">Mixer champions</div>
            <div className="mt-9 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-[22px] p-6 text-left" style={{ background: 'oklch(0.215 0.03 264)', border: '1px solid oklch(0.36 0.04 266)' }}>
                <div className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: 'var(--court)' }}>Podium</div>
                <div className="mt-5 grid gap-3">
                  {standings.slice(0, Math.max(3, cfg?.podium_markets ?? 3)).map((row) => (
                    <div key={row.playerId} className="flex items-center justify-between gap-4 rounded-2xl px-4 py-3" style={{ background: 'oklch(0.285 0.038 266)' }}>
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.08em]" style={{ color: 'oklch(0.7 0.03 264)' }}>{ordinal(row.rank)}</div>
                        <div className="text-[24px] font-bold">{row.displayName}</div>
                      </div>
                      <div className="mono text-[30px] font-bold" style={{ color: 'var(--court)' }}>{row.points}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="grid gap-4">
                <div className="rounded-[22px] p-6 text-left" style={{ background: 'oklch(0.215 0.03 264)', border: '1px solid oklch(0.36 0.04 266)' }}>
                  <div className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: 'var(--court)' }}>Raffle winner</div>
                  <div className="mt-4 text-[30px] font-bold">{raffleWinner?.displayName ?? 'No tickets'}</div>
                  <div className="mono mt-2 text-[24px]" style={{ color: 'oklch(0.78 0.028 264)' }}>{raffleWinner ? `${raffleWinner.tickets} tickets` : '0 tickets'}</div>
                  <div className="mt-2 text-sm" style={{ color: 'oklch(0.78 0.028 264)' }}>{raffleWinner?.prize ?? cfg?.raffle_prize ?? 'Raffle prize'} · {Math.round(totalTickets * 10) / 10} tickets in hat</div>
                </div>
                <div className="rounded-[22px] p-6 text-left" style={{ background: 'oklch(0.215 0.03 264)', border: '1px solid oklch(0.36 0.04 266)' }}>
                  <div className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: 'var(--court)' }}>Pool payouts</div>
                  <div className="mt-1 text-xs" style={{ color: 'oklch(0.78 0.028 264)' }}>Rake {Math.round(Number(cfg?.betting_rake_pct ?? 0) * 100)}%</div>
                  <div className="mt-4 grid gap-2">
                    {settlements.slice(0, 4).map((row) => (
                      <div key={`${row.bettorPlayerId}-${row.marketPlace}`} className="flex justify-between text-sm">
                        <span>{name(row.bettorPlayerId)} · #{row.marketPlace}</span>
                        <span className="mono" style={{ color: 'var(--court)' }}>{row.payout}</span>
                      </div>
                    ))}
                    {settlements.length === 0 && <div className="text-sm" style={{ color: 'oklch(0.78 0.028 264)' }}>No winning pool tickets.</div>}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : pairingRows.length === 0 ? (
          <div>
            <div className="text-[12px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--court)' }}>{round?.state === 'drawing' ? 'Drawing partners' : 'Waiting on the draw'}</div>
            <div className="serif mt-3 text-[58px] leading-none">{round?.state === 'locked' ? 'The ballot is sealed.' : 'Who did the tokens pick?'}</div>
            <div className="mt-4 text-base" style={{ color: 'oklch(0.78 0.028 264)' }}>{round?.state === 'locked' ? 'Run the draw from organizer controls to reveal every court.' : 'Lock voting, run the draw, then this board reveals every court.'}</div>
          </div>
        ) : (
          <div className="w-full max-w-6xl">
            <div className="text-[12px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--court)' }}>Round {round?.round_no} pairings</div>
            <div className="serif mt-2 text-[58px] leading-none">Take your courts</div>
            <div className="mt-9 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {courts.map((courtNo) => {
                const teams = pairingRows.filter((p) => p.court_no === courtNo);
                return (
                  <div key={courtNo} className="rounded-[22px] p-6 text-left" style={{ background: 'oklch(0.215 0.03 264)', border: '1px solid oklch(0.36 0.04 266)' }}>
                    <div className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: 'var(--court)' }}>Court {courtNo}</div>
                    <div className="mt-5 grid gap-4">
                      {teams.map((team, idx) => (
                        <div key={team.id}>
                          <div className="text-[11px] uppercase tracking-[0.08em]" style={{ color: 'oklch(0.7 0.03 264)' }}>Team {idx === 0 ? 'A' : 'B'}</div>
                          <div className="mt-1 text-[22px] font-bold">{name(team.player_a_id)} & {name(team.player_b_id)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            {sitOutRows.length > 0 && (
              <div className="mt-6 rounded-[22px] p-5 text-left" style={{ background: 'oklch(0.215 0.03 264)', border: '1px solid oklch(0.36 0.04 266)' }}>
                <div className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: 'var(--court)' }}>Sitting out this round</div>
                <div className="mt-2 text-[24px] font-bold">{sitOutRows.map((s) => name(s.player_id)).join(' · ')}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ordinal(n: number) {
  const suffix = n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th';
  return `${n}${suffix}`;
}
