'use client';

import { useState } from 'react';
import type { PlayerRow, StandingItem } from '../_types';
import { ordinal } from './mixer-night';
import { MedalPodium, type PodiumEntry } from '@/components/ui/MedalPodium';

// The finalized player standings (night surface): a medal podium reveal above
// the full ranked list. When the field has both women and men, an Overall ⇄
// By-gender toggle swaps the single podium for two side-by-side ones — the
// design handoff's "Finalize standings" podium in its two modes.
export function MixerFinalStandings({
  standings,
  roster,
  myPlayerId,
}: {
  standings: StandingItem[];
  roster: PlayerRow[];
  myPlayerId: string | null;
}) {
  const genderOf = (id: string) => roster.find((p) => p.id === id)?.gender ?? null;
  const toEntry = (row: StandingItem): PodiumEntry => ({
    playerId: row.playerId,
    name: row.displayName,
    points: row.points,
    isMe: row.playerId === myPlayerId,
  });

  const women = standings.filter((r) => genderOf(r.playerId) === 'f');
  const men = standings.filter((r) => genderOf(r.playerId) === 'm');
  const canSplit = women.length >= 1 && men.length >= 1;

  const [mode, setMode] = useState<'overall' | 'gender'>('overall');
  const showGender = canSplit && mode === 'gender';

  return (
    <div className="px-[18px]">
      <div className="mb-3 rounded-2xl p-5" style={{ background: 'var(--night-card)', border: '1px solid var(--night-line)' }}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.08em]" style={{ color: 'var(--court)' }}>Final standings</div>
            <div className="serif mt-1 text-[32px] leading-none">Mixer complete</div>
          </div>
          {canSplit ? (
            <div className="flex rounded-full p-0.5" style={{ background: 'var(--night-inset)', border: '1px solid var(--night-line)' }}>
              {(['overall', 'gender'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className="rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors"
                  style={mode === m ? { background: 'var(--court)', color: 'var(--night-court-ink)' } : { color: 'var(--night-text2)' }}
                >
                  {m === 'overall' ? 'Overall' : 'By gender'}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="mt-5">
          {showGender ? (
            <div className="grid grid-cols-2 gap-4">
              <MedalPodium title="Women" small top3={women.slice(0, 3).map(toEntry)} />
              <MedalPodium title="Men" small top3={men.slice(0, 3).map(toEntry)} />
            </div>
          ) : (
            <MedalPodium top3={standings.slice(0, 3).map(toEntry)} />
          )}
        </div>
      </div>

      <div className="grid gap-2">
        {standings.slice(0, 12).map((row) => {
          const me = row.playerId === myPlayerId;
          return (
            <div
              key={row.playerId}
              className="flex items-center justify-between rounded-2xl p-3"
              style={{
                background: me ? 'color-mix(in oklch, var(--court) 18%, var(--night-card))' : 'var(--night-card)',
                border: me ? '1px solid var(--court)' : '1px solid var(--night-line)',
              }}
            >
              <div className="flex items-center gap-3">
                <span className="mono w-8 text-[11px] uppercase tracking-[0.08em]" style={{ color: 'var(--night-text3)' }}>{ordinal(row.rank)}</span>
                <span className="text-sm font-bold">{me ? 'You' : row.displayName}</span>
              </div>
              <div className="mono text-xl font-bold" style={{ color: 'var(--court)' }}>{row.points}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
