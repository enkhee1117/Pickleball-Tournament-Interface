'use client';

import { useActionState } from 'react';
import {
  assignPlayerDivision,
  removeTournamentPlayer,
  renameTournamentPlayer,
} from '../actions';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { FormStatus } from '@/components/ui/FormStatus';
import { emptyFormState } from '@/lib/forms';

type DivisionOption = { id: string; name: string };

type Props = {
  tournamentId: string;
  playerId: string;
  defaultName: string;
  email: string | null;
  linkedToProfile: boolean;
  canManage: boolean;
  divisionId: string | null;
  divisions: DivisionOption[];
};

export function PlayerRow({
  tournamentId,
  playerId,
  defaultName,
  email,
  linkedToProfile,
  canManage,
  divisionId,
  divisions,
}: Props) {
  const [renameState, renameAction] = useActionState(renameTournamentPlayer, emptyFormState);
  const [, removeAction] = useActionState(removeTournamentPlayer, emptyFormState);
  const [assignState, assignAction] = useActionState(assignPlayerDivision, emptyFormState);

  if (!canManage) {
    return (
      <div className="flex items-center justify-between rounded-md border border-border-dark bg-dark-bg px-3 py-2">
        <div>
          <p className="font-medium">{defaultName}</p>
          {email && <p className="text-xs text-text-muted">{email}</p>}
        </div>
        <div className="flex items-center gap-2">
          {divisionId && divisions.find((d) => d.id === divisionId) && (
            <span className="rounded-full border border-volt/30 bg-volt/10 px-2 py-0.5 text-xs text-volt">
              {divisions.find((d) => d.id === divisionId)?.name}
            </span>
          )}
          {linkedToProfile && (
            <span className="rounded-full border border-success/40 bg-success/10 px-2 py-0.5 text-xs text-emerald-300">
              linked
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1 rounded-md border border-border-dark bg-dark-bg px-3 py-2">
      <form action={renameAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="player_id" value={playerId} />
        <input type="hidden" name="tournament_id" value={tournamentId} />
        <input
          className="input min-w-32 flex-1 !py-1"
          name="display_name"
          defaultValue={defaultName}
          required
          minLength={2}
          maxLength={120}
        />
        <SubmitButton className="btn btn-ghost !px-2 !py-1 text-xs" pendingLabel="...">
          Save
        </SubmitButton>
        {linkedToProfile ? (
          <span className="rounded-full border border-success/40 bg-success/10 px-2 py-0.5 text-xs text-emerald-300">
            linked
          </span>
        ) : email ? (
          <span className="rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-xs text-amber-300">
            pending
          </span>
        ) : null}
      </form>
      <FormStatus state={renameState} className="!py-1 text-xs" />

      {divisions.length > 0 && (
        <form action={assignAction} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="player_id" value={playerId} />
          <input type="hidden" name="tournament_id" value={tournamentId} />
          <label className="text-xs uppercase tracking-wider text-text-muted">Division</label>
          <select
            className="input !py-1 text-xs"
            name="division_id"
            defaultValue={divisionId ?? 'open'}
          >
            <option value="open">— unassigned —</option>
            {divisions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <SubmitButton className="btn btn-ghost !px-2 !py-1 text-xs" pendingLabel="...">
            Assign
          </SubmitButton>
          <FormStatus state={assignState} className="!py-1 text-xs" />
        </form>
      )}

      <form action={removeAction}>
        <input type="hidden" name="player_id" value={playerId} />
        <input type="hidden" name="tournament_id" value={tournamentId} />
        <button
          type="submit"
          className="text-xs text-red-400 hover:text-red-300"
          formNoValidate
        >
          Remove player
        </button>
      </form>
    </div>
  );
}
