'use client';

import { useEffect, useMemo, useState } from 'react';
import { Avatar, playerFromName } from '@/components/ui/Avatar';
import { placeMixerBet } from './actions';

type ConfigRow = {
  starting_chips: number;
  betting_enabled: boolean;
  podium_markets: number;
  betting_rake_pct: number;
};

type PlayerRow = {
  id: string;
  display_name: string;
  gender: 'm' | 'f' | 'x' | null;
  dupr: number | null;
};

type StateRow = {
  player_id: string;
  chips_remaining: number;
};

type BetRow = {
  market_place: number;
  bettor_player_id: string;
  pick_player_id: string;
  chips: number;
};

export function MixerBettingPanel({
  tournamentId,
  roster,
  myPlayer,
  myState,
  bets,
  config,
}: {
  tournamentId: string;
  roster: PlayerRow[];
  myPlayer: PlayerRow;
  myState: StateRow | null;
  bets: BetRow[];
  config: ConfigRow;
}) {
  const [optimisticBets, setOptimisticBets] = useState(bets);
  const markets = useMemo(
    () => Array.from({ length: Math.max(1, Math.min(config.podium_markets ?? 3, 8)) }, (_, i) => i + 1),
    [config.podium_markets],
  );
  const serverStaked = bets.reduce((sum, bet) => sum + bet.chips, 0);
  const optimisticStaked = optimisticBets.reduce((sum, bet) => sum + bet.chips, 0);
  const serverBalance = myState?.chips_remaining ?? config.starting_chips;
  const budget = Math.max(config.starting_chips, serverBalance + serverStaked);
  const chipsLeft = Math.max(0, budget - optimisticStaked);

  useEffect(() => setOptimisticBets(bets), [bets]);

  const submitBet = async (formData: FormData) => {
    const marketPlace = Number(formData.get('market_place') ?? 1);
    const pickPlayerId = String(formData.get('pick_player_id') ?? '');
    const chips = Math.max(1, Number(formData.get('chips') ?? 1));
    setOptimisticBets((current) => {
      const next = current.filter((bet) => !(bet.market_place === marketPlace && bet.pick_player_id === pickPlayerId));
      next.push({
        market_place: marketPlace,
        bettor_player_id: myPlayer.id,
        pick_player_id: pickPlayerId,
        chips,
      });
      return next;
    });
    await placeMixerBet(formData);
  };

  if (!config.betting_enabled) return <EmptyPool />;

  return (
    <div className="px-[18px]">
      <div className="mb-3 grid grid-cols-[1fr_auto] items-center gap-3 rounded-2xl p-4" style={{ background: 'var(--night-card)', border: '1px solid var(--night-line)' }}>
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.08em]" style={{ color: 'var(--night-text3)' }}>Podium pools</div>
          <div className="serif mt-1 text-[32px] leading-none">Back your podium picks</div>
          <div className="mt-3 flex items-end justify-between gap-4">
            <div className="text-xs leading-5" style={{ color: 'var(--night-text2)' }}>
              Markets settle from final standings. Rake {Math.round(Number(config.betting_rake_pct ?? 0) * 100)}%.
            </div>
            <div className="text-right">
              <div className="mono text-[28px] font-bold" style={{ color: 'var(--court)' }}>{chipsLeft}</div>
              <div className="text-[10px] uppercase tracking-[0.08em]" style={{ color: 'var(--night-text3)' }}>chips left</div>
            </div>
          </div>
        </div>
        <Dink pose="token-t" size={78} />
      </div>

      <div className="grid gap-3">
        {markets.map((place) => {
          const marketBets = optimisticBets.filter((bet) => bet.market_place === place);
          const marketTotal = marketBets.reduce((sum, bet) => sum + bet.chips, 0);
          return (
            <section key={place} className="rounded-2xl p-4" style={{ background: 'var(--night-card)', border: '1px solid var(--night-line)' }}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.08em]" style={{ color: 'var(--court)' }}>{ordinal(place)} place</div>
                  <div className="text-lg font-extrabold">Market</div>
                </div>
                <div className="mono rounded-full px-3 py-1 text-sm font-bold" style={{ background: 'var(--night-inset)', color: 'var(--night-text2)' }}>
                  You: {marketTotal}
                </div>
              </div>
              <div className="mt-3 grid gap-2">
                {roster.map((player) => {
                  const mine = marketBets.find((bet) => bet.pick_player_id === player.id);
                  const maxChips = Math.max(1, Math.min(1000, chipsLeft + (mine?.chips ?? 0)));
                  const suggested = Math.min(10, maxChips);
                  const share = marketTotal > 0 ? Math.max(6, Math.round(((mine?.chips ?? 0) / marketTotal) * 100)) : 0;
                  return (
                    <form key={player.id} action={submitBet} className="rounded-xl p-2" style={{ background: mine ? 'color-mix(in oklch, var(--court) 12%, var(--night-inset))' : 'var(--night-inset)', border: mine ? '1px solid color-mix(in oklch, var(--court) 60%, var(--night-line-2))' : '1px solid transparent' }}>
                      <input type="hidden" name="tournament_id" value={tournamentId} />
                      <input type="hidden" name="bettor_player_id" value={myPlayer.id} />
                      <input type="hidden" name="pick_player_id" value={player.id} />
                      <input type="hidden" name="market_place" value={place} />
                      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
                        <Avatar player={mixerAvatarFor(player, myPlayer.id)} size={34} ring={!!mine} />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-extrabold">{player.id === myPlayer.id ? 'You' : player.display_name}</div>
                          <div className="mono mt-0.5 text-[11px]" style={{ color: 'var(--night-text3)' }}>
                            {mine ? `${mine.chips} chips on ticket` : `DUPR ${player.dupr ?? '-'}`}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            key={mine?.chips ?? 0}
                            name="chips"
                            type="number"
                            min={1}
                            max={maxChips}
                            defaultValue={mine?.chips ?? suggested}
                            className="mono h-10 w-16 rounded-xl text-center text-ink outline-none"
                          />
                          <button
                            disabled={chipsLeft <= 0 && !mine}
                            className="h-10 rounded-xl px-3 text-xs font-extrabold disabled:opacity-40"
                            style={{
                              background: mine ? 'var(--court)' : 'transparent',
                              color: mine ? 'var(--night-court-ink)' : 'var(--court)',
                              border: mine ? 'none' : '1px solid var(--court)',
                            }}
                          >
                            {mine ? 'Edit' : 'Bet'}
                          </button>
                        </div>
                      </div>
                      {mine && (
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--night-line)' }}>
                          <div className="h-full rounded-full" style={{ width: `${share}%`, background: 'var(--court)' }} />
                        </div>
                      )}
                    </form>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function EmptyPool() {
  return (
    <div className="px-[18px] pt-6">
      <div className="rounded-2xl p-6 text-center" style={{ background: 'var(--night-card)', border: '1px dashed var(--night-line)' }}>
        <div className="mb-2 flex justify-center"><Dink pose="presenting-t" size={96} /></div>
        <div className="serif text-[30px] leading-none">Pool is off</div>
        <div className="mt-2 text-sm" style={{ color: 'var(--night-text2)' }}>This Mixer is running without podium pools.</div>
      </div>
    </div>
  );
}

function Dink({ pose, size }: { pose: 'token-t' | 'presenting-t'; size: number }) {
  // Paddle mascot retired — the round "ball" mascot (in /characters) is used now.
  const file = pose === 'token-t' ? 'voter' : 'host';
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/design-handoff/characters/${file}.png`}
      alt=""
      width={size}
      height={size}
      className="shrink-0 object-contain"
      style={{ width: size, height: size }}
    />
  );
}

function mixerAvatarFor(player: PlayerRow, selfId?: string) {
  if (selfId && player.id === selfId) {
    return playerFromName(player.display_name, '/design-handoff/avatars/me.png');
  }
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
