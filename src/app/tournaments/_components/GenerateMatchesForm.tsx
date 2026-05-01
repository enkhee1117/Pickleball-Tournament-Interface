'use client';

import { useActionState, useMemo, useState } from 'react';
import { generateMatches } from '../actions';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { FormStatus } from '@/components/ui/FormStatus';
import { emptyFormState } from '@/lib/forms';

type DivisionOption = { id: string; name: string; assignedPlayers: number };

type Props = {
  tournamentId: string;
  playerCount: number;
  openDivisionPlayerCount: number;
  divisions: DivisionOption[];
};

const SCHEMES = [
  {
    id: 'rotating_partners',
    title: 'Rotating partners',
    blurb:
      'Social mixer. Players are reshuffled each round into 2v2 games. Best for casual play with mixed skill levels.',
    needsRounds: true,
  },
  {
    id: 'fixed_partners',
    title: 'Fixed partners',
    blurb:
      'Pairs adjacent players into fixed teams, then each team plays every other team once (circle method).',
    needsRounds: false,
  },
  {
    id: 'single_elimination',
    title: 'Single elimination',
    blurb:
      'Bracket: pairs adjacent players into teams, then seeds them into a knockout. Round 1 is generated; later rounds are added when winners are decided.',
    needsRounds: false,
  },
] as const;

export function GenerateMatchesForm({
  tournamentId,
  playerCount,
  openDivisionPlayerCount,
  divisions,
}: Props) {
  const [state, formAction] = useActionState(generateMatches, emptyFormState);
  const [scheme, setScheme] = useState<(typeof SCHEMES)[number]['id']>('rotating_partners');
  const [rounds, setRounds] = useState(5);
  const [courts, setCourts] = useState(2);
  const [divisionId, setDivisionId] = useState<string>('open');

  const scopedPlayerCount = useMemo(() => {
    if (divisionId === 'open') return openDivisionPlayerCount;
    return divisions.find((d) => d.id === divisionId)?.assignedPlayers ?? 0;
  }, [divisionId, divisions, openDivisionPlayerCount]);
  void playerCount; // total roster size displayed elsewhere

  const preview = useMemo(() => {
    const playerCount = scopedPlayerCount;
    if (playerCount < 4) return 'Add at least 4 players to this scope.';
    if (scheme === 'rotating_partners') {
      const gamesPerRound = Math.floor(playerCount / 4);
      const sittingOut = playerCount - gamesPerRound * 4;
      const total = rounds * gamesPerRound;
      return `~${total} games over ${rounds} rounds (${gamesPerRound} courts active${
        sittingOut ? `, ${sittingOut} player(s) sit out each round` : ''
      }).`;
    }
    if (scheme === 'fixed_partners') {
      if (playerCount % 2 !== 0) return 'Needs an even number of players.';
      const teams = playerCount / 2;
      const games = (teams * (teams - 1)) / 2;
      return `${teams} teams, ${teams - 1} rounds, ${games} games total.`;
    }
    if (scheme === 'single_elimination') {
      if (playerCount % 2 !== 0) return 'Needs an even number of players.';
      const teams = playerCount / 2;
      let bracket = 1;
      while (bracket < teams) bracket *= 2;
      const round1 = teams - (bracket - teams);
      return `${teams} teams (bracket of ${bracket}), Round 1: up to ${Math.floor(round1 / 2)} games. Add later rounds after R1 finishes.`;
    }
    return '';
  }, [scheme, rounds, scopedPlayerCount]);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="tournament_id" value={tournamentId} />
      <input type="hidden" name="division_id" value={divisionId} />

      {divisions.length > 0 && (
        <div>
          <label className="label" htmlFor="gm-div">Generate for</label>
          <select
            id="gm-div"
            className="input !py-1"
            value={divisionId}
            onChange={(e) => setDivisionId(e.target.value)}
          >
            <option value="open">Unassigned roster ({openDivisionPlayerCount})</option>
            {divisions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.assignedPlayers} player{d.assignedPlayers === 1 ? '' : 's'})
              </option>
            ))}
          </select>
        </div>
      )}

      <fieldset className="space-y-2">
        <legend className="label">Pairing scheme</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {SCHEMES.map((s) => (
            <label
              key={s.id}
              className={`block cursor-pointer rounded-md border px-3 py-2 transition ${
                scheme === s.id
                  ? 'border-volt/60 bg-volt/10'
                  : 'border-border-dark bg-dark-bg hover:border-volt/30'
              }`}
            >
              <input
                type="radio"
                name="scheme"
                value={s.id}
                checked={scheme === s.id}
                onChange={() => setScheme(s.id)}
                className="sr-only"
              />
              <p className="font-display text-sm font-semibold">{s.title}</p>
              <p className="mt-1 text-xs text-text-muted">{s.blurb}</p>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="gm-courts">Courts</label>
          <input
            id="gm-courts"
            className="input !py-1"
            name="courts"
            type="number"
            min={1}
            max={16}
            inputMode="numeric"
            value={courts}
            onChange={(e) => setCourts(Math.max(1, Math.min(16, Number(e.target.value) || 1)))}
          />
        </div>
        {scheme === 'rotating_partners' && (
          <div>
            <label className="label" htmlFor="gm-rounds">Rounds</label>
            <input
              id="gm-rounds"
              className="input !py-1"
              name="rounds"
              type="number"
              min={1}
              max={50}
              inputMode="numeric"
              value={rounds}
              onChange={(e) => setRounds(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
            />
          </div>
        )}
        <div className="sm:col-span-1 sm:flex sm:items-end">
          <p className="text-xs text-text-muted">{preview}</p>
        </div>
      </div>

      <FormStatus state={state} />

      <SubmitButton className="btn btn-primary" pendingLabel="Generating...">
        Generate {scopedPlayerCount > 0 ? `for ${scopedPlayerCount} players` : 'matches'}
      </SubmitButton>
      <p className="text-xs text-text-muted">
        Heads up: regenerating wipes any matches that haven&rsquo;t been scored yet. Completed
        matches stay put.
      </p>
    </form>
  );
}
