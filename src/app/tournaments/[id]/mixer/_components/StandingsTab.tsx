'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  computeStandings,
  latestScoredRound,
  orderMovements,
  playerGamesMap,
  type CourtResult,
} from '@/lib/mixer-standings';
import { Avatar } from '@/components/ui/Avatar';
import { mixerAvatarFor } from './mixer-night';
import type { PairingRow, PlayerRow, RoundRow, ScoreRow } from '../_types';

// The player's dedicated Standings surface (handoff standings.html): the live
// board every player can read — a leader spotlight, the full ranked list with
// the viewer's row highlighted, and a "your night" rail (record, diff, games
// left, gap to 1st) plus a shortcut back to their live match. Mirrors the
// cockpit StandingsBoard's visual language but player-flavored (no finalize,
// no drawer) and themed to the player surface (--night-* tokens). Re-sorts as
// scores post; ▲/▼ shows places moved since the last re-sort.

const firstName = (n: string) => n.split(' ')[0];

export function StandingsTab({
  tournamentId,
  results,
  currentPairings,
  currentScores,
  roster,
  currentRound,
  roundCount,
  selfPlayerId,
}: {
  tournamentId: string;
  results: CourtResult[];
  currentPairings: PairingRow[];
  currentScores: ScoreRow[];
  roster: PlayerRow[];
  currentRound: RoundRow;
  roundCount: number;
  selfPlayerId: string;
}) {
  const namesMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of results) for (const p of [...r.teamA, ...r.teamB]) m.set(p.id, p.name);
    for (const p of roster) m.set(p.id, p.display_name);
    return m;
  }, [results, roster]);
  const standings = useMemo(() => computeStandings(results, namesMap), [results, namesMap]);
  const gamesMap = useMemo(() => playerGamesMap(results), [results]);
  const scored = latestScoredRound(results);
  const avatarFor = (id: string, name: string) => mixerAvatarFor({ id, display_name: name }, selfPlayerId);

  // Movement deltas + flash (handoff score-flow.html): when a posted score
  // re-sorts the board, show ▲/▼ places moved next to the rank and briefly
  // flash the rows that moved. Same pattern the cockpit StandingsBoard uses.
  const orderSig = standings.map((r) => r.playerId).join(',');
  const prevOrderRef = useRef<string[]>([]);
  const [deltas, setDeltas] = useState<Record<string, number>>({});
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    const prev = prevOrderRef.current;
    const cur = standings.map((r) => r.playerId);
    prevOrderRef.current = cur;
    if (prev.length === 0) return; // first paint — nothing to compare against
    const moved = orderMovements(prev, cur);
    if (Object.keys(moved).length === 0) return;
    setDeltas(moved);
    setFlashIds(new Set(Object.keys(moved)));
    const t = setTimeout(() => setFlashIds(new Set()), 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderSig]);

  const leader = standings[0] ?? null;
  const myIndex = standings.findIndex((r) => r.playerId === selfPlayerId);
  const me = myIndex >= 0 ? standings[myIndex] : null;
  const myGames = gamesMap.get(selfPlayerId);
  const gamesLeft = myGames ? Math.max(0, myGames.scheduled - myGames.played) : 0;
  const gapToFirst = me && leader ? Math.max(0, leader.points - me.points) : 0;

  const heading =
    scored > 0 ? `After Round ${scored} of ${roundCount}` : `Round 1 of ${roundCount} · not started yet`;
  const leaderSub = leader
    ? `${leader.wins}–${leader.losses}${leader.losses === 0 && leader.wins > 0 ? ' · undefeated so far' : ''} · ${leader.points} pts`
    : '';

  return (
    <div className="px-[18px] lg:px-0">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <div className="serif text-[30px] leading-none">Standings</div>
          <div className="mono mt-1.5 text-[11px] tracking-[0.06em]" style={{ color: 'var(--night-text3)' }}>
            {heading} · updates as scores post
          </div>
        </div>
        <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.06em]" style={{ color: 'var(--serve)' }}>
          <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full" style={{ background: 'var(--serve)' }} />
          Live
        </span>
      </div>

      {standings.length === 0 ? (
        <div className="rounded-[18px] p-8 text-center text-sm" style={{ background: 'var(--night-card)', border: '1px dashed var(--night-line)', color: 'var(--night-text3)' }}>
          No results yet — scores land here the moment the first court posts.
        </div>
      ) : (
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-5">
          {/* Leader hero — full width across both columns. On phones the sub
              line drops to its own row so the name + point-diff never collide. */}
          {leader ? (
            <div
              className="relative overflow-hidden rounded-[20px] p-5 text-white lg:col-span-2 lg:p-6"
              style={{ background: 'linear-gradient(135deg, oklch(0.26 0.06 150), oklch(0.16 0.02 260) 72%)' }}
            >
              <div className="flex items-center gap-3 lg:gap-5">
                <div
                  className="disp grid h-12 w-12 shrink-0 place-items-center rounded-[14px] text-[24px] font-black lg:h-[60px] lg:w-[60px] lg:rounded-[16px] lg:text-[30px]"
                  style={{ background: 'var(--court)', color: 'var(--night-court-ink)' }}
                >
                  1
                </div>
                <Avatar player={avatarFor(leader.playerId, leader.name)} size={56} />
                <div className="min-w-0 flex-1">
                  <div className="mono text-[10px] font-bold uppercase tracking-[0.1em] lg:text-[11px] lg:tracking-[0.14em]" style={{ color: 'var(--court)' }}>
                    🏆 Leader of the night
                  </div>
                  <div className="disp mt-1 truncate text-[24px] font-extrabold leading-none lg:text-[30px]">
                    {leader.playerId === selfPlayerId ? 'You' : leader.name}
                  </div>
                  <div className="mono mt-1.5 hidden text-[12.5px] lg:block" style={{ color: 'rgba(255,255,255,.72)' }}>
                    {leaderSub}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="mono text-[30px] font-bold leading-none tracking-[-0.03em] lg:text-[44px]" style={{ color: 'var(--court)' }}>
                    {leader.pointDiff > 0 ? '+' : ''}{leader.pointDiff}
                  </div>
                  <div className="mono mt-1.5 text-[10px] uppercase tracking-[0.12em]" style={{ color: 'rgba(255,255,255,.6)' }}>
                    Point diff
                  </div>
                </div>
              </div>
              <div className="mono mt-3 text-[12px] lg:hidden" style={{ color: 'rgba(255,255,255,.72)' }}>
                {leaderSub}
              </div>
            </div>
          ) : null}

          {/* Ranked board */}
          <div className="rounded-[18px]" style={{ background: 'var(--night-card)', border: '1px solid var(--night-line)' }}>
            <div className="mono grid grid-cols-[34px_1fr_54px_48px] items-center gap-2 px-4 py-3 text-[10px] uppercase tracking-[0.1em] lg:grid-cols-[38px_1fr_60px_52px_38px]" style={{ color: 'var(--night-text3)', borderBottom: '1px solid var(--night-line)' }}>
              <span>#</span>
              <span>Player</span>
              <span className="text-right">W–L</span>
              <span className="text-right">Diff</span>
              <span className="hidden text-right lg:block">GP</span>
            </div>
            {standings.map((row, i) => {
              const rank = i + 1;
              const isSelf = row.playerId === selfPlayerId;
              const delta = deltas[row.playerId] ?? 0;
              const flashing = flashIds.has(row.playerId);
              const gp = gamesMap.get(row.playerId)?.played ?? row.wins + row.losses;
              return (
                <div
                  key={row.playerId}
                  className="grid grid-cols-[34px_1fr_54px_48px] items-center gap-2 px-4 py-3 lg:grid-cols-[38px_1fr_60px_52px_38px]"
                  style={{
                    transition: 'background-color .4s ease',
                    borderTop: i === 0 ? undefined : '1px solid var(--night-line)',
                    background: flashing
                      ? 'color-mix(in oklch, var(--court) 22%, transparent)'
                      : isSelf
                        ? 'color-mix(in oklch, var(--court) 12%, transparent)'
                        : undefined,
                  }}
                >
                  <span className="mono flex items-center gap-1 text-[16px] font-bold" style={{ color: rank === 1 ? 'var(--court)' : 'var(--night-text3)' }}>
                    {rank}
                    {delta !== 0 ? (
                      <span className="mono text-[10px] font-bold" style={{ color: delta > 0 ? 'var(--court)' : 'var(--serve)' }}>
                        {delta > 0 ? '▲' : '▼'}{Math.abs(delta)}
                      </span>
                    ) : null}
                  </span>
                  <span className="flex min-w-0 items-center gap-2.5">
                    <Avatar player={avatarFor(row.playerId, row.name)} size={36} ring={isSelf} />
                    <span className="truncate text-[15px] font-semibold">{isSelf ? firstName(row.name) : row.name}</span>
                    {isSelf ? (
                      <span className="mono rounded-[5px] px-1.5 py-px text-[9px]" style={{ color: 'var(--court)', border: '1px solid color-mix(in oklch, var(--court) 40%, var(--night-line))' }}>
                        YOU
                      </span>
                    ) : null}
                  </span>
                  <span className="mono text-right text-[15px]" style={{ color: 'var(--night-text2)' }}>{row.wins}–{row.losses}</span>
                  <span className="mono text-right text-[15px] font-bold" style={{ color: row.pointDiff >= 0 ? 'var(--court)' : 'var(--night-text3)' }}>
                    {row.pointDiff > 0 ? '+' : ''}{row.pointDiff}
                  </span>
                  <span className="mono hidden text-right text-[14px] lg:block" style={{ color: 'var(--night-text3)' }}>{gp}</span>
                </div>
              );
            })}
          </div>

          {/* Right rail — your night + your match + explainer */}
          <div className="flex flex-col gap-4 lg:sticky lg:top-[90px]">
            {me ? (
              <div className="rounded-[18px] p-4" style={{ background: 'var(--night-card)', border: '1px solid var(--night-line)' }}>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-[14px] font-semibold">Your night</h3>
                  <span className="mono rounded-full px-2.5 py-0.5 text-[11px] font-bold" style={{ background: 'color-mix(in oklch, var(--court) 18%, transparent)', color: 'var(--court)' }}>
                    {ordinalShort(myIndex + 1)}
                  </span>
                </div>
                <YourRow k="Record" v={`${me.wins}–${me.losses}`} />
                <YourRow k="Point diff" v={`${me.pointDiff > 0 ? '+' : ''}${me.pointDiff}`} pos={me.pointDiff >= 0} />
                <YourRow k="Games left" v={String(gamesLeft)} />
                <YourRow k="Gap to 1st" v={myIndex === 0 ? 'Leading' : `${gapToFirst} pts`} pos={myIndex === 0} last />
              </div>
            ) : null}

            <YourMatch
              tournamentId={tournamentId}
              currentPairings={currentPairings}
              currentScores={currentScores}
              roster={roster}
              currentRound={currentRound}
              selfPlayerId={selfPlayerId}
            />

            <div className="rounded-[18px] p-4" style={{ background: 'var(--night-inset)', border: '1px solid var(--night-line)' }}>
              <p className="text-[12.5px] leading-[1.55]" style={{ color: 'var(--night-text2)' }}>
                Sorted by <b style={{ color: 'var(--night-text)' }}>points</b>, then record, then point differential. Your
                row is highlighted; <b style={{ color: 'var(--night-text)' }}>▲▼</b> shows places moved since the last score
                posted.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function YourRow({ k, v, pos, last }: { k: string; v: string; pos?: boolean; last?: boolean }) {
  return (
    <div
      className="flex items-center justify-between py-2.5 text-[14px]"
      style={last ? undefined : { borderBottom: '1px solid var(--night-line)' }}
    >
      <span style={{ color: 'var(--night-text2)' }}>{k}</span>
      <span className="mono text-[15px] font-bold" style={{ color: pos ? 'var(--court)' : 'var(--night-text)' }}>{v}</span>
    </div>
  );
}

function YourMatch({
  tournamentId,
  currentPairings,
  currentScores,
  roster,
  currentRound,
  selfPlayerId,
}: {
  tournamentId: string;
  currentPairings: PairingRow[];
  currentScores: ScoreRow[];
  roster: PlayerRow[];
  currentRound: RoundRow;
  selfPlayerId: string;
}) {
  const name = (id: string) => roster.find((p) => p.id === id)?.display_name ?? 'TBD';
  const mine = currentPairings.find((p) => p.player_a_id === selfPlayerId || p.player_b_id === selfPlayerId);
  if (!mine) return null;
  const opponent = currentPairings.find((p) => p.court_no === mine.court_no && p.wave_no === mine.wave_no && p.id !== mine.id);
  const score = currentScores.find((s) => s.court_no === mine.court_no && s.wave_no === mine.wave_no);
  const live = !score?.completed_at;
  const partnerId = mine.player_a_id === selfPlayerId ? mine.player_b_id : mine.player_a_id;
  const yourTeam = `You & ${firstName(name(partnerId))}`;
  const oppTeam = opponent ? `${firstName(name(opponent.player_a_id))} & ${firstName(name(opponent.player_b_id))}` : null;
  return (
    <div className="rounded-[18px] p-4" style={{ background: 'var(--night-card)', border: '1px solid var(--night-line)' }}>
      <h3 className="mb-3 text-[14px] font-semibold">Your match · Round {currentRound.round_no}</h3>
      <Link
        href={`/tournaments/${tournamentId}/mixer?tab=match`}
        className="flex items-center gap-3 rounded-[14px] p-3"
        style={{ background: 'var(--night-inset)', border: '1px solid var(--night-line)' }}
      >
        <div className="min-w-0">
          <div className="mono text-[11px] uppercase tracking-[0.08em]" style={{ color: live ? 'var(--serve)' : 'var(--night-text3)' }}>
            Court {mine.court_no}{mine.wave_no > 1 ? ` · Heat ${mine.wave_no}` : ''} · {live ? 'live' : 'final'}
          </div>
          <div className="mt-1 truncate text-[14px] font-semibold">
            {yourTeam}{oppTeam ? ` vs ${oppTeam}` : ''}
          </div>
        </div>
        <span className="ml-auto shrink-0 text-[18px]" style={{ color: 'var(--court)' }}>→</span>
      </Link>
    </div>
  );
}

function ordinalShort(n: number): string {
  const v = n % 100;
  const suffix = v >= 11 && v <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th';
  return `${n}${suffix}`;
}
