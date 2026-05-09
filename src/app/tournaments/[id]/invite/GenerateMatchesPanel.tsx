'use client';

import { useState } from 'react';
import { generateMatchesFromRoster } from './actions';
import { SubmitButton } from '@/components/ui/SubmitButton';

type Props = {
  tournamentId: string;
  format: string;
  rosterCount: number;
  hasMatches: boolean;
};

export function GenerateMatchesPanel({ tournamentId, format, rosterCount, hasMatches }: Props) {
  const isFixed = format === 'fixed_partners';
  const [courts, setCourts] = useState(2);
  const [rounds, setRounds] = useState(5);

  const tooFew = rosterCount < 4;
  const oddForFp = isFixed && rosterCount % 2 !== 0;
  const disabled = tooFew || oddForFp;

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    if (!hasMatches) return;
    if (
      !window.confirm(
        'This replaces every pending match. Completed matches keep their scores. Continue?',
      )
    ) {
      e.preventDefault();
    }
  };

  return (
    <form
      action={generateMatchesFromRoster}
      onSubmit={onSubmit}
      className="mb-4 rounded-[18px] bg-white p-4"
      style={{ border: '1px solid var(--line)' }}
    >
      <input type="hidden" name="tournament_id" value={tournamentId} />
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[13px] font-semibold text-ink">
          {isFixed ? 'Auto-pair teams' : 'Generate the schedule'}
        </div>
        {hasMatches && (
          <div className="text-[10.5px] uppercase tracking-[0.06em] text-ink-3">
            Replaces pending matches
          </div>
        )}
      </div>
      <div className="mb-3 text-[12px] text-ink-3">
        {isFixed
          ? 'Pairs adjacent roster spots into teams (P1+P2, P3+P4 …) and schedules every team to play every other team.'
          : 'Shuffles the roster into 2v2 games each round. Each round changes partners.'}
      </div>

      <div className="mb-3">
        <input type="hidden" name="courts" value={courts} />
        <input type="hidden" name="rounds" value={rounds} />
        <div className="text-[10px] uppercase tracking-[0.06em] text-ink-3">Courts</div>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {[1, 2, 3, 4, 5, 6].map((n) => {
            const on = courts === n;
            return (
              <button
                key={n}
                type="button"
                onClick={() => setCourts(n)}
                className="mono w-9 rounded-lg py-1.5 text-[13px] font-bold"
                style={{
                  background: on ? 'var(--ink)' : '#fff',
                  color: on ? 'var(--paper)' : 'var(--ink-2)',
                  border: `1px solid ${on ? 'var(--ink)' : 'var(--line)'}`,
                }}
              >
                {n}
              </button>
            );
          })}
        </div>
        {!isFixed && (
          <>
            <div className="mt-3 text-[10px] uppercase tracking-[0.06em] text-ink-3">Rounds</div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {[3, 4, 5, 6, 7, 8, 10, 12].map((n) => {
                const on = rounds === n;
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRounds(n)}
                    className="mono w-9 rounded-lg py-1.5 text-[13px] font-bold"
                    style={{
                      background: on ? 'var(--ink)' : '#fff',
                      color: on ? 'var(--paper)' : 'var(--ink-2)',
                      border: `1px solid ${on ? 'var(--ink)' : 'var(--line)'}`,
                    }}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      <SubmitButton
        disabled={disabled}
        pendingLabel="Generating…"
        className="w-full rounded-xl px-3 py-3 text-[13px] font-semibold disabled:opacity-50"
        style={{ background: 'var(--court)', color: 'oklch(0.2 0.04 140)' }}
      >
        {tooFew
          ? 'Need 4+ players'
          : oddForFp
            ? 'Need an even number of players'
            : hasMatches
              ? 'Regenerate matches'
              : 'Generate matches →'}
      </SubmitButton>
    </form>
  );
}
