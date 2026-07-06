'use client';

import { useMemo, useState } from 'react';
import {
  computeStandings,
  playerGamesMap,
  tallyGames,
  type CourtResult,
  type PlayerGames,
  type StandingRow,
} from '@/lib/mixer-standings';
import { GamesProgressStrip } from '@/components/ui/GamesProgressStrip';
import { MedalPodium, type PodiumEntry } from '@/components/ui/MedalPodium';
import { finalizeMixerEvent } from '../actions';
import { ActionForm } from './ActionForm';
import type { PlayerRow } from '../_types';

// The cockpit's Standings tab (handoff admin.html "pane-standings"): the games
// progress strip, the live board (rank · player · W–L · games dots · diff ·
// pts), and — when the event is finalized — a locked board with the medal
// podium (Overall ⇄ By-gender). Finalizing is a two-step confirm; if games
// remain it warns before locking, settling the raffle and pools.
const firstName = (n: string) => n.split(' ')[0];
const initials = (n: string) =>
  n.split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

function Face({ name }: { name: string }) {
  return (
    <span className="av" style={{ width: 32, height: 32, fontSize: 11, color: 'var(--court-deep)' }} aria-hidden>
      {initials(name)}
    </span>
  );
}

function GamesDots({ games }: { games: PlayerGames | undefined }) {
  const scheduled = games?.scheduled ?? 0;
  const played = games?.played ?? 0;
  const onCourt = games?.onCourt ?? false;
  if (scheduled === 0) return <span />;
  return (
    <span className="flex items-center justify-end gap-2" title={`${played} of ${scheduled} games played`}>
      <span className="flex gap-[3px]" aria-hidden>
        {Array.from({ length: scheduled }, (_, i) => {
          const live = onCourt && i === played;
          const bg = i < played ? 'var(--court)' : live ? 'var(--serve)' : 'var(--line-2)';
          return <span key={i} className={`h-2 w-2 rounded-full ${live ? 'animate-pulse-dot' : ''}`} style={{ background: bg }} />;
        })}
      </span>
      <span className="mono text-[12.5px]" style={{ color: 'var(--text3)' }}>{played}/{scheduled}</span>
    </span>
  );
}

export function StandingsBoard({
  tournamentId,
  results,
  genders,
  finalized,
}: {
  tournamentId: string;
  results: CourtResult[];
  genders: Record<string, PlayerRow['gender']>;
  finalized: boolean;
}) {
  const namesMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of results) for (const p of [...r.teamA, ...r.teamB]) m.set(p.id, p.name);
    return m;
  }, [results]);
  const standings = useMemo(() => computeStandings(results, namesMap), [results, namesMap]);
  const gamesMap = useMemo(() => playerGamesMap(results), [results]);
  const gamesLeft = tallyGames(results).left;

  const toEntry = (row: StandingRow): PodiumEntry => ({ playerId: row.playerId, name: row.name, points: row.points });
  const women = standings.filter((r) => genders[r.playerId] === 'f');
  const men = standings.filter((r) => genders[r.playerId] === 'm');
  const canSplit = women.length >= 1 && men.length >= 1;
  const [podMode, setPodMode] = useState<'overall' | 'gender'>('overall');

  if (standings.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {results.length > 0 ? <GamesProgressStrip results={results} /> : null}
        <div className="rounded-2xl bg-white p-8 text-center text-sm" style={{ border: '1px dashed var(--line)', color: 'var(--ink-3)' }}>
          No results yet — post a court on the Scores tab to build the board.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <GamesProgressStrip results={results} />

      {finalized ? (
        <div className="rounded-[18px] p-5" style={{ background: 'var(--surface-inset)', border: '1px solid var(--line)' }}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="chip" style={{ background: 'color-mix(in oklch, var(--court) 20%, transparent)', color: 'var(--court-deep)' }}>
              Standings final
            </span>
            {canSplit ? (
              <div className="flex rounded-full p-0.5" style={{ background: 'var(--card)', border: '1px solid var(--line)' }}>
                {(['overall', 'gender'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setPodMode(m)}
                    className="rounded-full px-3 py-1 text-[12px] font-semibold"
                    style={podMode === m ? { background: 'var(--court)', color: 'var(--accent-ink)' } : { color: 'var(--ink-2)' }}
                  >
                    {m === 'overall' ? 'Overall' : 'By gender'}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          {canSplit && podMode === 'gender' ? (
            <div className="grid grid-cols-2 gap-4">
              <MedalPodium title="Women" small top3={women.slice(0, 3).map(toEntry)} />
              <MedalPodium title="Men" small top3={men.slice(0, 3).map(toEntry)} />
            </div>
          ) : (
            <MedalPodium top3={standings.slice(0, 3).map(toEntry)} />
          )}
        </div>
      ) : null}

      <div className="rounded-[18px] p-2" style={{ background: 'var(--card)', border: '1px solid var(--line)' }}>
        <div className="mono grid grid-cols-[34px_1fr_120px_60px_56px] items-center gap-2 px-4 py-2 text-[10px] uppercase tracking-[.08em]" style={{ color: 'var(--ink-3)' }}>
          <span>#</span>
          <span>Player</span>
          <span className="text-right">Games</span>
          <span className="text-right">Diff</span>
          <span className="text-right">Pts</span>
        </div>
        {standings.map((row, i) => {
          const medal = i < 3 && finalized ? ['var(--amber)', 'oklch(0.82 0.02 250)', 'oklch(0.66 0.09 55)'][i] : null;
          return (
            <div
              key={row.playerId}
              className="grid grid-cols-[34px_1fr_120px_60px_56px] items-center gap-2 rounded-xl px-4 py-2.5"
              style={{ background: i % 2 ? 'var(--surface-inset)' : undefined }}
            >
              <span className="mono flex items-center gap-1.5 text-[15px] font-bold" style={{ color: 'var(--ink-3)' }}>
                {medal ? <span className="h-2.5 w-2.5 rounded-full" style={{ background: medal }} /> : null}
                {i + 1}
              </span>
              <span className="flex min-w-0 items-center gap-2.5">
                <Face name={row.name} />
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-semibold leading-tight" style={{ color: 'var(--ink)' }}>{firstName(row.name)}</span>
                  <span className="mono text-[11px]" style={{ color: 'var(--ink-3)' }}>{row.wins}–{row.losses}</span>
                </span>
              </span>
              <GamesDots games={gamesMap.get(row.playerId)} />
              <span className="mono text-right text-[13px]" style={{ color: 'var(--ink-2)' }}>
                {row.pointDiff > 0 ? '+' : ''}{row.pointDiff}
              </span>
              <span className="mono text-right text-[15px] font-bold" style={{ color: 'var(--court-deep)' }}>{row.points}</span>
            </div>
          );
        })}
      </div>

      {!finalized ? (
        <ActionForm
          action={finalizeMixerEvent}
          confirm={
            gamesLeft > 0
              ? `${gamesLeft} game${gamesLeft === 1 ? '' : 's'} still unplayed. Finalize standings anyway? This locks the board, reveals the podium, and settles the raffle & pools.`
              : 'Finalize standings? This locks the board, reveals the podium, and settles the raffle & pools.'
          }
          successToast="Standings finalized"
        >
          <input type="hidden" name="tournament_id" value={tournamentId} />
          <button
            type="submit"
            className="w-full rounded-2xl py-3.5 text-[15px] font-bold"
            style={
              gamesLeft > 0
                ? { background: 'color-mix(in oklch, var(--berry) 12%, var(--card))', color: 'var(--berry)', border: '1px solid color-mix(in oklch, var(--berry) 40%, var(--line))' }
                : { background: 'var(--court)', color: 'var(--accent-ink)' }
            }
          >
            {gamesLeft > 0 ? `Finalize anyway (${gamesLeft} left)` : 'Finalize standings'}
          </button>
        </ActionForm>
      ) : null}
    </div>
  );
}
