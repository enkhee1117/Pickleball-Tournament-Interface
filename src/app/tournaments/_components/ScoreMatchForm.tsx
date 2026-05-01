'use client';

import { useActionState } from 'react';
import { scoreMatch } from '../actions';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { FormStatus } from '@/components/ui/FormStatus';
import { emptyFormState } from '@/lib/forms';

export type GameInput = { team_a_score: number | null; team_b_score: number | null };

type Props = {
  tournamentId: string;
  matchId: string;
  bestOf: 1 | 3 | 5;
  targetScore: number;
  winBy: number;
  defaultGames: GameInput[];
};

export function ScoreMatchForm({
  tournamentId,
  matchId,
  bestOf,
  targetScore,
  winBy,
  defaultGames,
}: Props) {
  const [state, formAction] = useActionState(scoreMatch, emptyFormState);
  const slots = Array.from({ length: bestOf }, (_, i) => defaultGames[i] ?? { team_a_score: null, team_b_score: null });

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="tournament_id" value={tournamentId} />
      <input type="hidden" name="match_id" value={matchId} />
      <p className="text-xs text-text-muted">
        Best of {bestOf} to {targetScore} (win by {winBy})
      </p>
      <div className="grid grid-cols-[auto_repeat(var(--cols),minmax(48px,1fr))_auto] items-end gap-1" style={{ ['--cols' as string]: bestOf } as React.CSSProperties}>
        <span className="text-xs text-text-muted">A</span>
        {slots.map((g, i) => (
          <input
            key={`a${i}`}
            className="input !py-1 text-center text-base font-display tabular-nums"
            name={`g${i + 1}_a`}
            type="number"
            min={0}
            max={99}
            inputMode="numeric"
            defaultValue={g.team_a_score ?? ''}
            placeholder="–"
          />
        ))}
        <span className="invisible text-xs">_</span>
        <span className="text-xs text-text-muted">B</span>
        {slots.map((g, i) => (
          <input
            key={`b${i}`}
            className="input !py-1 text-center text-base font-display tabular-nums"
            name={`g${i + 1}_b`}
            type="number"
            min={0}
            max={99}
            inputMode="numeric"
            defaultValue={g.team_b_score ?? ''}
            placeholder="–"
          />
        ))}
        <span className="invisible text-xs">_</span>
      </div>
      <div className="flex items-center justify-between">
        <SubmitButton className="btn btn-primary !py-1 !px-3 text-xs" pendingLabel="...">
          Save
        </SubmitButton>
        <FormStatus state={state} className="!px-2 !py-1 text-xs" />
      </div>
    </form>
  );
}
