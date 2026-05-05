'use client';

import { useState } from 'react';
import { generateMatchesFromRoster } from './actions';

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

      <div className="mb-3 grid grid-cols-2 gap-2">
        <label className="rounded-xl bg-paper-2 px-3 py-2 text-[12px]">
          <div className="text-[10px] uppercase tracking-[0.06em] text-ink-3">Courts</div>
          <input
            type="number"
            name="courts"
            min={1}
            max={6}
            value={courts}
            onChange={(e) => setCourts(Math.max(1, Math.min(6, Number(e.target.value) || 1)))}
            className="mono mt-0.5 w-full bg-transparent text-[20px] font-bold tracking-tight text-ink outline-none"
          />
        </label>
        {!isFixed && (
          <label className="rounded-xl bg-paper-2 px-3 py-2 text-[12px]">
            <div className="text-[10px] uppercase tracking-[0.06em] text-ink-3">Rounds</div>
            <input
              type="number"
              name="rounds"
              min={1}
              max={20}
              value={rounds}
              onChange={(e) => setRounds(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
              className="mono mt-0.5 w-full bg-transparent text-[20px] font-bold tracking-tight text-ink outline-none"
            />
          </label>
        )}
      </div>

      <button
        type="submit"
        disabled={disabled}
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
      </button>
    </form>
  );
}
