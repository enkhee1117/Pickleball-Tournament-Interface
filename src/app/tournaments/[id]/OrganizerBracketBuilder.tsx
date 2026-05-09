'use client';

import { useActionState, useMemo, useState } from 'react';
import { generatePlayoffsFromOrganizerSeed } from '@/app/tournaments/actions';
import { emptyFormState } from '@/lib/forms';
import { SubmitButton } from '@/components/ui/SubmitButton';

type Player = {
  id: string;
  name: string;
  gender: 'm' | 'f' | 'x' | null;
  rank: number | null;
};

type Team = [string | null, string | null];

type Props = {
  tournamentId: string;
  // Players sorted by RR standings (winners first). Pass standings rank so
  // we can show "M1 / F2" etc. and so the auto-pair button has an order.
  players: Player[];
  genderMode: 'open' | 'mixed' | 'same';
};

// Organizer-driven bracket builder. The auto-seeder for mixed RR has no way
// to know which M should partner which F, so this lets the organizer pick
// four teams of two by hand.
//
// Tap-to-build: tap any player → highlighted as the pending pick → tap a
// second player → forms a team. For mixed mode the second pick has to be
// the other gender. The "Auto pair" button stamps a sensible default
// (top-rated M with top-rated F, etc.) so the organizer can tweak from
// there instead of starting blank.
export function OrganizerBracketBuilder({ tournamentId, players, genderMode }: Props) {
  const [state, formAction] = useActionState(generatePlayoffsFromOrganizerSeed, emptyFormState);
  const [teams, setTeams] = useState<Team[]>([
    [null, null],
    [null, null],
    [null, null],
    [null, null],
  ]);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const males = useMemo(() => players.filter((p) => p.gender === 'm'), [players]);
  const females = useMemo(() => players.filter((p) => p.gender === 'f'), [players]);

  const usedIds = useMemo(() => new Set(teams.flat().filter((id): id is string => !!id)), [teams]);
  const pendingPlayer = pendingId ? byId.get(pendingId) ?? null : null;

  const onTap = (id: string) => {
    if (usedIds.has(id)) return;
    if (pendingId === id) {
      setPendingId(null);
      return;
    }
    if (!pendingId) {
      setPendingId(id);
      return;
    }
    // Two picks → form a team. For mixed, enforce M+F.
    const a = byId.get(pendingId);
    const b = byId.get(id);
    if (!a || !b) return;
    if (genderMode === 'mixed' && a.gender === b.gender) {
      // Same gender on a mixed team — let the new pick replace the pending.
      setPendingId(id);
      return;
    }
    const slot = teams.findIndex((t) => t[0] === null && t[1] === null);
    if (slot < 0) {
      // All four teams filled — start replacing the first slot? Easier to
      // just clear and ask the organizer to remove a team manually.
      setPendingId(null);
      return;
    }
    setTeams((prev) => {
      const copy = prev.slice() as Team[];
      // Put the M first when mixed so the team label is consistent.
      if (genderMode === 'mixed' && a.gender === 'f' && b.gender === 'm') {
        copy[slot] = [b.id, a.id];
      } else {
        copy[slot] = [a.id, b.id];
      }
      return copy;
    });
    setPendingId(null);
  };

  const removeTeam = (idx: number) => {
    setTeams((prev) => {
      const copy = prev.slice() as Team[];
      copy[idx] = [null, null];
      return copy;
    });
  };

  const reset = () => {
    setTeams([
      [null, null],
      [null, null],
      [null, null],
      [null, null],
    ]);
    setPendingId(null);
  };

  const autoPair = () => {
    if (genderMode === 'mixed') {
      const next: Team[] = [];
      for (let i = 0; i < 4; i += 1) {
        const m = males[i];
        const f = females[i];
        if (!m || !f) {
          next.push([null, null]);
        } else {
          next.push([m.id, f.id]);
        }
      }
      setTeams(next);
    } else {
      // Same-gender or open: just pair top 8 in order.
      const next: Team[] = [];
      for (let i = 0; i < 4; i += 1) {
        const a = players[i * 2];
        const b = players[i * 2 + 1];
        if (!a || !b) {
          next.push([null, null]);
        } else {
          next.push([a.id, b.id]);
        }
      }
      setTeams(next);
    }
    setPendingId(null);
  };

  const teamsReady = teams.every((t) => t[0] !== null && t[1] !== null);

  // Submit payload: array of [name, name] pairs (the action joins with " & ").
  const teamsJson = JSON.stringify(
    teams.map((t) => [
      t[0] ? byId.get(t[0])?.name ?? '' : '',
      t[1] ? byId.get(t[1])?.name ?? '' : '',
    ]),
  );

  const renderPlayerChip = (p: Player) => {
    const isUsed = usedIds.has(p.id);
    const isPending = pendingId === p.id;
    const incompatible =
      genderMode === 'mixed' &&
      pendingPlayer != null &&
      pendingPlayer.id !== p.id &&
      pendingPlayer.gender === p.gender;
    return (
      <button
        key={p.id}
        type="button"
        onClick={() => onTap(p.id)}
        disabled={isUsed || incompatible}
        className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold disabled:opacity-30"
        style={{
          background: isPending ? 'var(--ink)' : '#fff',
          color: isPending ? 'var(--paper)' : 'var(--ink)',
          border: `1px solid ${isPending ? 'var(--ink)' : 'var(--line)'}`,
        }}
      >
        {p.rank != null && (
          <span className="mono text-[10px] text-ink-3" style={{ color: isPending ? 'var(--paper)' : 'var(--ink-3)' }}>
            #{p.rank}
          </span>
        )}
        <span>{p.name}</span>
      </button>
    );
  };

  return (
    <form action={formAction} className="rounded-2xl bg-white p-4" style={{ border: '1px solid var(--line)' }}>
      <input type="hidden" name="tournament_id" value={tournamentId} />
      <input type="hidden" name="teams" value={teamsJson} />

      <div className="mb-2 flex items-center justify-between">
        <div className="text-[13px] font-semibold text-ink">Pick the four playoff teams</div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={autoPair}
            className="rounded-lg px-2.5 py-1 text-[11px] font-semibold"
            style={{ color: 'var(--ink-2)', border: '1px solid var(--line)' }}
          >
            Auto pair
          </button>
          <button
            type="button"
            onClick={reset}
            className="rounded-lg px-2.5 py-1 text-[11px] font-semibold"
            style={{ color: 'var(--ink-2)', border: '1px solid var(--line)' }}
          >
            Reset
          </button>
        </div>
      </div>
      <div className="mb-3 text-[12px] text-ink-3">
        {genderMode === 'mixed'
          ? 'Tap a man, then a woman, to form a mixed team. Repeat until all four teams are set.'
          : 'Tap two players to form a team. Repeat until all four teams are set.'}
      </div>

      <div className="grid gap-2">
        {teams.map((team, idx) => {
          const a = team[0] ? byId.get(team[0]) : null;
          const b = team[1] ? byId.get(team[1]) : null;
          const filled = !!a && !!b;
          return (
            <div
              key={idx}
              className="flex items-center gap-2 rounded-xl px-3 py-2"
              style={{
                background: filled ? 'oklch(0.96 0.04 140)' : 'var(--paper-2)',
                border: `1px solid ${filled ? 'var(--court-deep)' : 'var(--line)'}`,
              }}
            >
              <div className="mono text-[11px] font-bold text-ink-3">T{idx + 1}</div>
              <div className="flex-1 text-[13px] font-semibold text-ink">
                {filled ? `${a!.name} & ${b!.name}` : 'Empty — tap players below'}
              </div>
              {filled && (
                <button
                  type="button"
                  onClick={() => removeTeam(idx)}
                  className="rounded-lg px-2 py-1 text-[11px] font-semibold"
                  style={{ color: 'var(--berry)', border: '1px solid var(--line)' }}
                >
                  Clear
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 grid gap-3">
        {genderMode === 'mixed' ? (
          <>
            <PlayerGroup label="Men" players={males} renderChip={renderPlayerChip} />
            <PlayerGroup label="Women" players={females} renderChip={renderPlayerChip} />
          </>
        ) : (
          <PlayerGroup label="Players" players={players} renderChip={renderPlayerChip} />
        )}
      </div>

      {state.error && (
        <div
          className="mt-3 rounded-xl border px-3 py-2 text-[12px]"
          style={{ borderColor: 'var(--berry)', color: 'var(--berry)', background: 'oklch(0.96 0.04 12)' }}
        >
          {state.error}
        </div>
      )}

      <SubmitButton
        pendingLabel="Building bracket…"
        disabled={!teamsReady}
        className="mt-4 w-full rounded-2xl px-5 py-[14px] text-[15px] font-semibold tracking-tight disabled:opacity-50"
        style={{ background: 'var(--ink)', color: 'var(--paper)' }}
      >
        Generate bracket from these teams
      </SubmitButton>
    </form>
  );
}

function PlayerGroup({
  label,
  players,
  renderChip,
}: {
  label: string;
  players: Player[];
  renderChip: (p: Player) => React.ReactNode;
}) {
  if (players.length === 0) return null;
  return (
    <div>
      <div className="mb-1.5 text-[10px] uppercase tracking-[0.06em] text-ink-3">{label}</div>
      <div className="flex flex-wrap gap-1.5">{players.map(renderChip)}</div>
    </div>
  );
}
