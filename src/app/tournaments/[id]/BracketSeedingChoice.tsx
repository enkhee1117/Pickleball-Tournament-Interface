'use client';

import { useState } from 'react';
import { GeneratePlayoffsForm } from './GeneratePlayoffsForm';
import { OrganizerBracketBuilder } from './OrganizerBracketBuilder';
import { Icons } from '@/components/ui/icons';

type Player = {
  id: string;
  name: string;
  gender: 'm' | 'f' | 'x' | null;
  rank: number | null;
};

type Props = {
  tournamentId: string;
  players: Player[];
  genderMode: 'open' | 'mixed' | 'same';
};

// Default the bracket-tab CTA to the simple "Generate playoffs" button.
// Tapping the small "Pick teams manually" toggle swaps in the larger
// OrganizerBracketBuilder for managers who want to hand-pick the four
// teams (the headline use case is mixed RR where the auto-seeder pairs
// by raw rank, so two top women can end up against two top men).
export function BracketSeedingChoice({ tournamentId, players, genderMode }: Props) {
  const [manual, setManual] = useState(false);

  if (manual) {
    return (
      <div className="grid gap-3">
        <OrganizerBracketBuilder
          tournamentId={tournamentId}
          players={players}
          genderMode={genderMode}
        />
        <button
          type="button"
          onClick={() => setManual(false)}
          className="self-center text-[12px] font-semibold text-ink-3 underline"
        >
          ← Use auto-seed instead
        </button>
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <GeneratePlayoffsForm tournamentId={tournamentId} />
      <button
        type="button"
        onClick={() => setManual(true)}
        className="self-center inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold"
        style={{ color: 'var(--ink-2)', border: '1px solid var(--line)', background: '#fff' }}
      >
        {Icons.bars}
        <span>Pick teams manually</span>
      </button>
    </div>
  );
}
