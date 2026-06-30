'use client';

import { useEffect, useMemo, useState } from 'react';
import { Avatar, playerFromName } from '@/components/ui/Avatar';

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

type SitOutRow = {
  player_id: string;
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
  prize?: string;
};

type SettlementItem = {
  bettorPlayerId: string;
  marketPlace: number;
  payout: number;
};

type ConfigRow = {
  raffle_prize: string;
  betting_rake_pct: number;
  podium_markets: number;
};

export function MixerPresentationTakeover({
  round,
  roster,
  pairings,
  sitOuts,
  standings,
  raffleWinner,
  settlements,
  config,
  totalTickets,
}: {
  round: RoundRow | null;
  roster: PlayerRow[];
  pairings: PairingRow[];
  sitOuts: SitOutRow[];
  standings: StandingItem[];
  raffleWinner: RaffleItem | null;
  settlements: SettlementItem[];
  config: ConfigRow | null;
  totalTickets: number;
}) {
  if (standings.length > 0) {
    return (
      <FinalTakeover
        roster={roster}
        standings={standings}
        raffleWinner={raffleWinner}
        settlements={settlements}
        config={config}
        totalTickets={totalTickets}
      />
    );
  }

  if (pairings.length > 0) {
    return <RevealTakeover round={round} roster={roster} pairings={pairings} sitOuts={sitOuts} />;
  }

  return <WaitingTakeover round={round} />;
}

function RevealTakeover({
  round,
  roster,
  pairings,
  sitOuts,
}: {
  round: RoundRow | null;
  roster: PlayerRow[];
  pairings: PairingRow[];
  sitOuts: SitOutRow[];
}) {
  const courts = useMemo(() => [...new Set(pairings.map((pairing) => pairing.court_no))].sort((a, b) => a - b), [pairings]);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (courts.length <= 1) return;
    const timer = window.setInterval(() => setActiveIndex((index) => (index + 1) % courts.length), 3200);
    return () => window.clearInterval(timer);
  }, [courts.length]);

  const activeCourt = courts[activeIndex] ?? courts[0];
  const teams = pairings.filter((pairing) => pairing.court_no === activeCourt);

  return (
    <div className="grid w-full max-w-7xl gap-6 xl:grid-cols-[1fr_360px]">
      <div className="relative overflow-hidden rounded-[28px] p-8 text-left" style={{ background: 'radial-gradient(circle at 20% 0%, oklch(0.44 0.15 142 / 0.34), transparent 36%), oklch(0.215 0.03 264)', border: '1px solid oklch(0.42 0.045 266)' }}>
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="text-[12px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--court)' }}>Round {round?.round_no ?? 1} reveal</div>
            <div className="serif mt-3 text-[72px] leading-none">Court {activeCourt}</div>
          </div>
          <Dink pose="presenting-t" size={132} />
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {teams.map((team, index) => (
            <div key={team.id} className="rounded-[24px] p-5" style={{ background: 'oklch(0.285 0.038 266 / 0.92)', border: '1px solid oklch(0.47 0.06 266)' }}>
              <div className="text-[11px] uppercase tracking-[0.1em]" style={{ color: 'oklch(0.7 0.03 264)' }}>Team {index === 0 ? 'A' : 'B'}</div>
              <PlayerLine player={playerFor(team.player_a_id, roster)} />
              <PlayerLine player={playerFor(team.player_b_id, roster)} />
            </div>
          ))}
        </div>
      </div>
      <div className="grid content-start gap-4">
        <div className="rounded-[24px] p-5 text-left" style={{ background: 'oklch(0.215 0.03 264)', border: '1px solid oklch(0.36 0.04 266)' }}>
          <div className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: 'var(--court)' }}>All courts</div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {courts.map((courtNo, index) => (
              <button
                key={courtNo}
                type="button"
                onClick={() => setActiveIndex(index)}
                className="rounded-2xl px-4 py-3 text-left"
                style={{
                  background: courtNo === activeCourt ? 'var(--court)' : 'oklch(0.285 0.038 266)',
                  color: courtNo === activeCourt ? 'oklch(0.2 0.04 140)' : 'oklch(0.975 0.012 264)',
                }}
              >
                <div className="mono text-lg font-bold">C{courtNo}</div>
                <div className="mt-0.5 text-[10px] uppercase tracking-[0.08em]">Reveal</div>
              </button>
            ))}
          </div>
        </div>
        {sitOuts.length > 0 && (
          <div className="rounded-[24px] p-5 text-left" style={{ background: 'oklch(0.215 0.03 264)', border: '1px solid oklch(0.36 0.04 266)' }}>
            <div className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: 'var(--court)' }}>Sitting out</div>
            <div className="mt-3 grid gap-2">
              {sitOuts.map((row) => <PlayerLine key={row.player_id} player={playerFor(row.player_id, roster)} compact />)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FinalTakeover({
  roster,
  standings,
  raffleWinner,
  settlements,
  config,
  totalTickets,
}: {
  roster: PlayerRow[];
  standings: StandingItem[];
  raffleWinner: RaffleItem | null;
  settlements: SettlementItem[];
  config: ConfigRow | null;
  totalTickets: number;
}) {
  return (
    <div className="grid w-full max-w-7xl gap-6 xl:grid-cols-[0.9fr_1.1fr]">
      <div className="relative overflow-hidden rounded-[28px] p-8 text-left" style={{ background: 'radial-gradient(circle at 30% 10%, oklch(0.82 0.2 142 / 0.35), transparent 40%), oklch(0.215 0.03 264)', border: '1px solid oklch(0.42 0.045 266)' }}>
        <div className="text-[12px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--court)' }}>Raffle draw</div>
        <div className="mt-6 flex items-center justify-between gap-5">
          <div>
            <div className="serif text-[64px] leading-none">{raffleWinner?.displayName ?? 'No tickets'}</div>
            <div className="mono mt-5 text-[30px]" style={{ color: 'oklch(0.78 0.028 264)' }}>
              {raffleWinner ? `${Math.round(Number(raffleWinner.tickets ?? 0) * 10) / 10} tickets` : '0 tickets'}
            </div>
            <div className="mt-2 text-base" style={{ color: 'oklch(0.78 0.028 264)' }}>
              {raffleWinner?.prize ?? config?.raffle_prize ?? 'Raffle prize'} · {Math.round(totalTickets * 10) / 10} tickets in play
            </div>
          </div>
          <Dink pose="winner" size={160} />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-[24px] p-6 text-left" style={{ background: 'oklch(0.215 0.03 264)', border: '1px solid oklch(0.36 0.04 266)' }}>
          <div className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: 'var(--court)' }}>Podium</div>
          <div className="mt-5 grid gap-3">
            {standings.slice(0, Math.max(3, config?.podium_markets ?? 3)).map((row) => (
              <div key={row.playerId} className="flex items-center justify-between gap-4 rounded-2xl px-4 py-3" style={{ background: 'oklch(0.285 0.038 266)' }}>
                <div>
                  <div className="text-[11px] uppercase tracking-[0.08em]" style={{ color: 'oklch(0.7 0.03 264)' }}>{ordinal(row.rank)}</div>
                  <div className="text-[22px] font-bold">{row.displayName}</div>
                </div>
                <div className="mono text-[30px] font-bold" style={{ color: 'var(--court)' }}>{row.points}</div>
              </div>
            ))}
          </div>
        </section>
        <section className="rounded-[24px] p-6 text-left" style={{ background: 'oklch(0.215 0.03 264)', border: '1px solid oklch(0.36 0.04 266)' }}>
          <div className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: 'var(--court)' }}>Pool payouts</div>
          <div className="mt-1 text-xs" style={{ color: 'oklch(0.78 0.028 264)' }}>Rake {Math.round(Number(config?.betting_rake_pct ?? 0) * 100)}%</div>
          <div className="mt-5 grid gap-2">
            {settlements.slice(0, 6).map((row) => (
              <div key={`${row.bettorPlayerId}-${row.marketPlace}`} className="flex items-center justify-between gap-4 rounded-xl px-3 py-2" style={{ background: 'oklch(0.285 0.038 266)' }}>
                <span className="truncate text-sm">{playerFor(row.bettorPlayerId, roster).display_name} · #{row.marketPlace}</span>
                <span className="mono text-sm font-bold" style={{ color: 'var(--court)' }}>{row.payout}</span>
              </div>
            ))}
            {settlements.length === 0 && <div className="text-sm" style={{ color: 'oklch(0.78 0.028 264)' }}>No winning pool tickets.</div>}
          </div>
        </section>
      </div>
    </div>
  );
}

function WaitingTakeover({ round }: { round: RoundRow | null }) {
  return (
    <div className="max-w-4xl text-center">
      <Dink pose="wave" size={166} />
      <div className="mt-3 text-[12px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--court)' }}>
        {round?.state === 'drawing' ? 'Drawing partners' : 'Waiting on the draw'}
      </div>
      <div className="serif mt-3 text-[64px] leading-none">{round?.state === 'locked' ? 'The ballot is sealed.' : 'Who did the tokens pick?'}</div>
      <div className="mt-4 text-base" style={{ color: 'oklch(0.78 0.028 264)' }}>
        {round?.state === 'locked' ? 'Run the draw from organizer controls to reveal every court.' : 'Lock voting, run the draw, then this board reveals every court.'}
      </div>
    </div>
  );
}

function PlayerLine({ player, compact = false }: { player: PlayerRow; compact?: boolean }) {
  // Reveal moment: the partner name uses Instrument Serif italic in the
  // court accent (per brand handoff §8 / TourneyPal Implementation Handoff
  // §2). The compact sit-out list keeps the sans-serif so the editorial
  // emphasis stays on the partner names players actually care about.
  return (
    <div className={`mt-3 flex items-center gap-3 ${compact ? '' : 'rounded-2xl p-3'}`} style={compact ? undefined : { background: 'oklch(0.215 0.03 264)' }}>
      <Avatar player={mixerAvatarFor(player)} size={compact ? 36 : 54} ring={!compact} />
      <div className="min-w-0">
        <div
          className={
            compact
              ? 'truncate text-base font-extrabold'
              : 'serif truncate text-[34px] italic leading-tight'
          }
          style={compact ? undefined : { color: 'var(--court)' }}
        >
          {player.display_name}
        </div>
      </div>
    </div>
  );
}

function Dink({ pose, size }: { pose: 'presenting-t' | 'wave' | 'winner'; size: number }) {
  const file = pose === 'winner' ? 'presenting-t' : pose;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/design-handoff/dink/${file}.png`}
      alt=""
      width={size}
      height={size}
      className="shrink-0 object-contain"
      style={{ width: size, height: size }}
    />
  );
}

function playerFor(playerId: string, roster: PlayerRow[]) {
  return roster.find((player) => player.id === playerId) ?? { id: playerId, display_name: 'TBD' };
}

function mixerAvatarFor(player: PlayerRow) {
  const n = 2 + (hashString(player.id || player.display_name) % 11);
  return playerFromName(player.display_name, `/design-handoff/avatars/p${n}.png`);
}

function hashString(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function ordinal(n: number) {
  const suffix = n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th';
  return `${n}${suffix}`;
}
