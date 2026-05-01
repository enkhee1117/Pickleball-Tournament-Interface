'use client';

import { useActionState, useState } from 'react';
import { createDivision, deleteDivision } from '../actions';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { FormStatus } from '@/components/ui/FormStatus';
import { emptyFormState } from '@/lib/forms';

export type DivisionRow = {
  id: string;
  name: string;
  format: 'singles' | 'doubles';
  gender_constraint: 'm' | 'f' | 'mixed' | 'open' | null;
  skill_min: number | null;
  skill_max: number | null;
  age_min: number | null;
  age_max: number | null;
  best_of: 1 | 3 | 5;
  target_score: 11 | 15 | 21;
  win_by: 1 | 2;
};

export function DivisionsPanel({
  tournamentId,
  divisions,
  canManage,
  rosterCounts,
}: {
  tournamentId: string;
  divisions: DivisionRow[];
  canManage: boolean;
  rosterCounts: Record<string, number>;
}) {
  const [createState, createAction] = useActionState(createDivision, emptyFormState);
  const [deleteState, deleteAction] = useActionState(deleteDivision, emptyFormState);
  const [showCreate, setShowCreate] = useState(false);

  return (
    <section className="card">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="font-display text-xl font-semibold">Divisions</h2>
          <p className="text-xs text-text-muted">
            Skill / gender / age cohorts. Matches and standings are computed per division.
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            className="btn btn-ghost text-xs"
            onClick={() => setShowCreate((v) => !v)}
          >
            {showCreate ? 'Cancel' : 'Add division'}
          </button>
        )}
      </div>

      {showCreate && canManage && (
        <form action={createAction} className="mb-4 space-y-3 rounded-md border border-border-dark bg-dark-bg p-3">
          <input type="hidden" name="tournament_id" value={tournamentId} />
          <FormStatus state={createState} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="dv-name">Name</label>
              <input
                id="dv-name"
                className="input !py-1"
                name="name"
                placeholder="e.g. Mixed 3.5"
                required
                maxLength={80}
              />
            </div>
            <div>
              <label className="label" htmlFor="dv-format">Format</label>
              <select id="dv-format" className="input !py-1" name="format" defaultValue="doubles">
                <option value="doubles">Doubles</option>
                <option value="singles">Singles</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="dv-gender">Gender</label>
              <select id="dv-gender" className="input !py-1" name="gender_constraint" defaultValue="">
                <option value="">Any</option>
                <option value="open">Open</option>
                <option value="m">Men&apos;s</option>
                <option value="f">Women&apos;s</option>
                <option value="mixed">Mixed</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label" htmlFor="dv-skill-min">Skill min</label>
                <input
                  id="dv-skill-min"
                  className="input !py-1"
                  name="skill_min"
                  type="number"
                  step="0.25"
                  min={2}
                  max={8}
                  placeholder="e.g. 3.0"
                />
              </div>
              <div>
                <label className="label" htmlFor="dv-skill-max">Skill max</label>
                <input
                  id="dv-skill-max"
                  className="input !py-1"
                  name="skill_max"
                  type="number"
                  step="0.25"
                  min={2}
                  max={8}
                  placeholder="e.g. 3.5"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label" htmlFor="dv-age-min">Age min</label>
                <input
                  id="dv-age-min"
                  className="input !py-1"
                  name="age_min"
                  type="number"
                  min={0}
                  max={120}
                  placeholder="e.g. 50"
                />
              </div>
              <div>
                <label className="label" htmlFor="dv-age-max">Age max</label>
                <input
                  id="dv-age-max"
                  className="input !py-1"
                  name="age_max"
                  type="number"
                  min={0}
                  max={120}
                />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="dv-best">Best of</label>
              <select id="dv-best" className="input !py-1" name="best_of" defaultValue="1">
                <option value="1">Best of 1</option>
                <option value="3">Best of 3</option>
                <option value="5">Best of 5</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="dv-target">Game to</label>
              <select id="dv-target" className="input !py-1" name="target_score" defaultValue="11">
                <option value="11">11</option>
                <option value="15">15</option>
                <option value="21">21</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="dv-winby">Win by</label>
              <select id="dv-winby" className="input !py-1" name="win_by" defaultValue="2">
                <option value="2">2</option>
                <option value="1">1</option>
              </select>
            </div>
          </div>
          <SubmitButton className="btn btn-primary" pendingLabel="Creating...">
            Create division
          </SubmitButton>
        </form>
      )}

      {divisions.length === 0 ? (
        <p className="text-sm text-text-muted">
          No divisions yet. {canManage ? 'Add one above to split your tournament.' : ''}
        </p>
      ) : (
        <ul className="space-y-2">
          {divisions.map((d) => (
            <li
              key={d.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border-dark bg-dark-bg px-3 py-2"
            >
              <div>
                <p className="font-display font-semibold">{d.name}</p>
                <p className="text-xs text-text-muted">
                  {d.format} - {d.gender_constraint ?? 'any'} -{' '}
                  {d.skill_min || d.skill_max
                    ? `DUPR ${d.skill_min ?? '?'}-${d.skill_max ?? '?'}`
                    : 'any skill'}{' '}
                  - {d.age_min || d.age_max ? `Age ${d.age_min ?? '0'}-${d.age_max ?? '∞'}` : 'any age'}{' '}
                  - Bo{d.best_of} to {d.target_score} win by {d.win_by}
                  {' - '}
                  <span className="text-volt">{rosterCounts[d.id] ?? 0} player(s)</span>
                </p>
              </div>
              {canManage && (
                <form action={deleteAction}>
                  <input type="hidden" name="division_id" value={d.id} />
                  <input type="hidden" name="tournament_id" value={tournamentId} />
                  <button type="submit" className="text-xs text-red-400 hover:text-red-300">
                    Remove
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
      <FormStatus state={deleteState} className="mt-2" />
    </section>
  );
}
