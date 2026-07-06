'use client';

import { gameSlotLabel, type CourtResult } from '@/lib/mixer-standings';

// Shared score-entry primitives for both the dedicated score surface
// (ScoreFlow) and the cockpit Scores tab (CockpitScoreBoard): the game-to-11
// contract, the initials avatar, and the live/final scorecard with inline
// steppers + one-tap win. Presentational — the owner supplies the draft state
// and post/reopen handlers.

export const WIN_BY = 2;
export const GAME_TO = 11;
export const isValid = (a: number, b: number) => (a >= GAME_TO || b >= GAME_TO) && Math.abs(a - b) >= WIN_BY;

// One-tap win value: the target, or opponent + win-by on a deuce.
export function winValue(other: number): number {
  return other >= GAME_TO - 1 ? other + WIN_BY : GAME_TO;
}

export const firstName = (n: string) => n.split(' ')[0];
export const initials = (n: string) =>
  n
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

export function Face({ name, size = 32, border }: { name: string; size?: number; border?: string }) {
  return (
    <span
      className="av"
      style={{ width: size, height: size, fontSize: size * 0.36, border, color: 'var(--court-deep)' }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

export function ScoreCard({
  court,
  draft,
  editing,
  onStep,
  onQuick11,
  onPost,
  onReopen,
}: {
  court: CourtResult;
  draft: { a: number; b: number };
  editing: boolean;
  onStep: (side: 'a' | 'b', delta: number) => void;
  onQuick11: (side: 'a' | 'b') => void;
  onPost: () => void;
  onReopen: () => void;
}) {
  const valid = isValid(draft.a, draft.b);
  const live = court.editable && !court.completed;
  const spine = court.completed ? 'var(--court)' : live ? 'var(--serve)' : 'var(--line-2)';

  return (
    <div
      className="overflow-hidden rounded-[18px]"
      style={{ background: 'var(--card)', border: '1px solid var(--line)', borderLeft: `4px solid ${spine}` }}
    >
      <div className="flex items-center justify-between border-b p-[13px_18px]" style={{ borderColor: 'var(--line)' }}>
        <span className="mono text-[12px] uppercase tracking-[.12em]" style={{ color: 'var(--ink-3)' }}>
          {gameSlotLabel(court.courtNo, court.waveNo)}
        </span>
        {court.completed ? (
          <span className="chip" style={{ background: 'color-mix(in oklch, var(--court) 20%, transparent)', color: 'var(--court-deep)' }}>
            Final
          </span>
        ) : live ? (
          <span className="chip chip-live"><span className="dot" />On court</span>
        ) : (
          <span className="chip">Upcoming</span>
        )}
      </div>

      <div className="grid grid-cols-2">
        {(['a', 'b'] as const).map((side) => {
          const players = side === 'a' ? court.teamA : court.teamB;
          const score = side === 'a' ? draft.a : draft.b;
          const isWinner = court.completed && (side === 'a' ? draft.a > draft.b : draft.b > draft.a);
          const isLoser = court.completed && !isWinner && draft.a !== draft.b;
          return (
            <div
              key={side}
              className="relative px-5 pb-5 pt-[18px] text-center"
              style={{
                borderRight: side === 'a' ? '1px solid var(--line)' : undefined,
                background: isWinner ? 'color-mix(in oklch, var(--court) 12%, transparent)' : undefined,
                opacity: isLoser ? 0.55 : 1,
              }}
            >
              <div className="mb-2.5 flex justify-center">
                <Face name={players[0].name} size={44} border="3px solid var(--card)" />
                <span className="-ml-3.5">
                  <Face name={players[1].name} size={44} border="3px solid var(--card)" />
                </span>
              </div>
              <div className="text-[15px] font-bold">{players.map((p) => firstName(p.name)).join(' & ')}</div>
              <div
                className="mono mt-2 text-[64px] font-bold leading-none tracking-[-.04em]"
                style={{ color: isLoser ? 'var(--ink-3)' : side === 'a' ? 'var(--court-deep)' : 'var(--sky)' }}
              >
                {score}
              </div>

              {editing ? (
                <div className="mt-3 flex items-center justify-center gap-2">
                  <button
                    type="button"
                    aria-label={`Remove a point from team ${side.toUpperCase()}`}
                    onClick={() => onStep(side, -1)}
                    disabled={score <= 0}
                    className="flex h-10 w-10 items-center justify-center rounded-[12px] text-[20px] font-bold disabled:opacity-35"
                    style={{ border: '1px solid var(--line)', color: 'var(--ink)' }}
                  >
                    −
                  </button>
                  <button
                    type="button"
                    aria-label={`Add a point to team ${side.toUpperCase()}`}
                    onClick={() => onStep(side, 1)}
                    className="flex h-10 w-10 items-center justify-center rounded-[12px] text-[20px] font-bold"
                    style={{ background: side === 'a' ? 'var(--court)' : 'var(--sky)', color: 'var(--accent-ink)' }}
                  >
                    +
                  </button>
                  <button
                    type="button"
                    onClick={() => onQuick11(side)}
                    className="mono ml-1 rounded-[9px] px-2.5 py-2 text-[13px] font-bold"
                    style={{ background: 'color-mix(in oklch, var(--court) 18%, transparent)', color: 'var(--court-deep)' }}
                  >
                    {GAME_TO}
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="border-t p-[14px_18px]" style={{ borderColor: 'var(--line)' }}>
        {editing ? (
          <button
            type="button"
            onClick={onPost}
            disabled={!valid}
            className="w-full rounded-[14px] text-[15px] font-bold disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: 'var(--court)', color: 'var(--accent-ink)', height: 52 }}
          >
            Record final
          </button>
        ) : court.completed && court.editable ? (
          <button
            type="button"
            onClick={onReopen}
            className="w-full rounded-[14px] text-[14px] font-semibold"
            style={{ border: '1px solid var(--line)', color: 'var(--ink-2)', height: 48 }}
          >
            Reopen to edit
          </button>
        ) : (
          <div className="text-center text-[12.5px]" style={{ color: 'var(--ink-3)' }}>
            {court.completed ? 'Final — locked for this round' : 'Waiting to start'}
          </div>
        )}
        {editing && !valid ? (
          <div className="mt-2 text-center text-[11.5px]" style={{ color: 'var(--ink-3)' }}>
            A team needs {GAME_TO}+ and a {WIN_BY}-point lead to record.
          </div>
        ) : null}
      </div>
    </div>
  );
}
