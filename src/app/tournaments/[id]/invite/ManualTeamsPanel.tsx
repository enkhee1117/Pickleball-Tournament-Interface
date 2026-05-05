'use client';

import { useMemo, useState } from 'react';
import { generateManualMatchesFromRoster } from './actions';

type RosterPlayer = {
  id: string;
  display_name: string;
};

type Props = {
  tournamentId: string;
  roster: RosterPlayer[];
  hasMatches: boolean;
};

export function ManualTeamsPanel({ tournamentId, roster, hasMatches }: Props) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [teams, setTeams] = useState<Array<[string, string]>>([]);
  const [courts, setCourts] = useState(2);

  const usedIds = useMemo(() => new Set(teams.flat()), [teams]);
  const available = roster.filter((p) => !usedIds.has(p.id));

  const onTap = (id: string) => {
    if (pendingId === id) {
      setPendingId(null);
      return;
    }
    if (pendingId == null) {
      setPendingId(id);
      return;
    }
    setTeams((t) => [...t, [pendingId, id]]);
    setPendingId(null);
  };

  const removeTeam = (idx: number) => {
    setTeams((t) => t.filter((_, i) => i !== idx));
  };

  const reset = () => {
    setTeams([]);
    setPendingId(null);
  };

  const allPaired = available.length === 0 && teams.length > 0;
  const evenRoster = roster.length % 2 === 0;

  const nameById = useMemo(
    () => new Map(roster.map((r) => [r.id, r.display_name])),
    [roster],
  );

  return (
    <div
      className="mb-4 rounded-[18px] bg-white p-4"
      style={{ border: '1px solid var(--line)' }}
    >
      <div className="mb-1 flex items-center justify-between">
        <div className="text-[13px] font-semibold text-ink">Set teams manually</div>
        {hasMatches && (
          <div className="text-[10.5px] uppercase tracking-[0.06em] text-ink-3">
            Replaces pending matches
          </div>
        )}
      </div>
      <div className="mb-3 text-[12px] text-ink-3">
        Tap a player to start a team, then tap their partner. Repeat until everyone is paired.
      </div>

      {!evenRoster && (
        <div
          className="mb-3 rounded-xl px-3 py-2 text-[12px]"
          style={{ background: 'oklch(0.96 0.04 12)', color: 'var(--berry)' }}
        >
          You have {roster.length} players — fixed partners needs an even count. Add or remove a player to balance the roster.
        </div>
      )}

      <div className="mb-3">
        <div className="mb-1.5 text-[10.5px] uppercase tracking-[0.06em] text-ink-3">
          Unpaired ({available.length})
        </div>
        <div className="flex flex-wrap gap-1.5">
          {available.length === 0 ? (
            <div className="text-[12px] text-ink-3">Everyone has a team.</div>
          ) : (
            available.map((p) => {
              const isPending = p.id === pendingId;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onTap(p.id)}
                  className="rounded-full px-3 py-1.5 text-[12px] font-semibold"
                  style={{
                    background: isPending ? 'var(--court)' : '#fff',
                    color: 'var(--ink)',
                    border: `1px solid ${isPending ? 'var(--court-deep)' : 'var(--line)'}`,
                  }}
                >
                  {p.display_name}
                </button>
              );
            })
          )}
        </div>
      </div>

      {teams.length > 0 && (
        <div className="mb-3">
          <div className="mb-1.5 text-[10.5px] uppercase tracking-[0.06em] text-ink-3">
            Teams ({teams.length})
          </div>
          <div className="grid gap-1.5">
            {teams.map(([a, b], i) => (
              <div
                key={`${a}-${b}`}
                className="flex items-center justify-between rounded-xl bg-paper-2 px-3 py-2"
              >
                <div className="text-[13px] font-semibold text-ink">
                  {nameById.get(a)} <span className="text-ink-3">&</span> {nameById.get(b)}
                </div>
                <button
                  type="button"
                  onClick={() => removeTeam(i)}
                  className="text-[11px] font-semibold"
                  style={{ color: 'var(--berry)' }}
                >
                  Unpair
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mb-3 flex items-center justify-between">
        <label className="text-[12px] text-ink-3">
          Courts
          <input
            type="number"
            min={1}
            max={6}
            value={courts}
            onChange={(e) => setCourts(Math.max(1, Math.min(6, Number(e.target.value) || 1)))}
            className="mono ml-2 w-12 rounded-lg bg-paper-2 px-2 py-1 text-center text-[14px] font-bold text-ink outline-none"
          />
        </label>
        {teams.length > 0 && (
          <button
            type="button"
            onClick={reset}
            className="text-[11px] font-semibold text-ink-3 underline"
          >
            Reset teams
          </button>
        )}
      </div>

      <form
        action={generateManualMatchesFromRoster}
        onSubmit={(e) => {
          if (!hasMatches) return;
          if (
            !window.confirm(
              'This replaces every pending match. Completed matches keep their scores. Continue?',
            )
          ) {
            e.preventDefault();
          }
        }}
      >
        <input type="hidden" name="tournament_id" value={tournamentId} />
        <input type="hidden" name="courts" value={courts} />
        {teams.map(([a, b]) => (
          <input key={`${a}-${b}`} type="hidden" name="pairs" value={`${a},${b}`} />
        ))}
        <button
          type="submit"
          disabled={!allPaired || teams.length < 2}
          className="w-full rounded-xl px-3 py-3 text-[13px] font-semibold disabled:opacity-50"
          style={{ background: 'var(--court)', color: 'oklch(0.2 0.04 140)' }}
        >
          {teams.length < 2
            ? 'Pair at least two teams'
            : !allPaired
              ? `${available.length} player${available.length === 1 ? '' : 's'} still unpaired`
              : hasMatches
                ? 'Regenerate matches'
                : 'Generate matches →'}
        </button>
      </form>
    </div>
  );
}
