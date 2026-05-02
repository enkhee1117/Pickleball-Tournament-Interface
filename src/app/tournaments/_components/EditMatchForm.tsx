'use client';

import { useActionState, useEffect, useState } from 'react';
import { editMatch } from '../actions';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { FormStatus } from '@/components/ui/FormStatus';
import { emptyFormState } from '@/lib/forms';

export function EditMatchForm({
  tournamentId,
  matchId,
  defaultTeamA,
  defaultTeamB,
  defaultRound,
  defaultCourt,
}: {
  tournamentId: string;
  matchId: string;
  defaultTeamA: string;
  defaultTeamB: string;
  defaultRound: string;
  defaultCourt: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(editMatch, emptyFormState);

  useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state.ok]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-text-muted hover:text-slate-300"
      >
        Edit labels
      </button>
    );
  }

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="match_id" value={matchId} />
      <input type="hidden" name="tournament_id" value={tournamentId} />
      <FormStatus state={state} />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label text-[11px]">Team A</label>
          <input
            className="input !py-0.5 text-xs"
            name="team_a_label"
            defaultValue={defaultTeamA}
            required
          />
        </div>
        <div>
          <label className="label text-[11px]">Team B</label>
          <input
            className="input !py-0.5 text-xs"
            name="team_b_label"
            defaultValue={defaultTeamB}
            required
          />
        </div>
        <div>
          <label className="label text-[11px]">Round</label>
          <input
            className="input !py-0.5 text-xs"
            name="round_label"
            defaultValue={defaultRound}
          />
        </div>
        <div>
          <label className="label text-[11px]">Court</label>
          <input
            className="input !py-0.5 text-xs"
            name="court_label"
            defaultValue={defaultCourt}
          />
        </div>
      </div>
      <div className="flex gap-2">
        <SubmitButton className="btn btn-primary py-0.5 px-3 text-xs" pendingLabel="Saving...">
          Save
        </SubmitButton>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="btn btn-ghost py-0.5 px-3 text-xs"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
