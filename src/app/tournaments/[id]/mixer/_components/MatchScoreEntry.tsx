'use client';

import { useState, useTransition } from 'react';
import { submitMixerScoreAsPlayer } from '../actions';

// Courtside score entry on the player's own Match screen (ux-score.html): two
// team panels (A court-green, B serve-orange), ± steppers, game-to-11 win-by-2
// enforced before Post. Posting hits a participant-gated RPC and shows a clear
// "Posted to standings" state. Editable until the organizer marks the round done.

const WIN_BY = 2;
const isFinalValid = (a: number, b: number, target: number) => (a >= target || b >= target) && Math.abs(a - b) >= WIN_BY;

export function MatchScoreEntry({
  tournamentId,
  roundId,
  courtNo,
  waveNo,
  teamALabel,
  teamBLabel,
  myTeam,
  initialA,
  initialB,
  posted,
  canScore,
  gameTo = 11,
}: {
  tournamentId: string;
  roundId: string;
  courtNo: number;
  waveNo: number;
  teamALabel: string;
  teamBLabel: string;
  myTeam: 'a' | 'b';
  initialA: number;
  initialB: number;
  posted: boolean;
  canScore: boolean;
  gameTo?: number;
}) {
  const TARGET = gameTo;
  const SPINE = posted ? 'var(--court)' : 'var(--serve)';
  const [a, setA] = useState(initialA);
  const [b, setB] = useState(initialB);
  const [editing, setEditing] = useState(!posted);
  const [done, setDone] = useState(posted);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const valid = isFinalValid(a, b, TARGET);
  const winner = a === b ? null : a > b ? 'a' : 'b';

  // One-tap "win": set this team to the target, or opponent+win-by on a deuce.
  function quickWin(side: 'a' | 'b') {
    const other = side === 'a' ? b : a;
    const val = other >= TARGET - 1 ? other + WIN_BY : TARGET;
    if (side === 'a') setA(val);
    else setB(val);
  }

  function post() {
    setError(null);
    startTransition(async () => {
      const res = await submitMixerScoreAsPlayer({ tournamentId, roundId, courtNo, waveNo, teamAScore: a, teamBScore: b });
      if (res.ok) {
        setDone(true);
        setEditing(false);
      } else {
        setError(res.error ?? 'Could not post the score.');
      }
    });
  }

  // Posted, not editing → the confirmation card.
  if (done && !editing) {
    return (
      <div className="mt-3 rounded-[18px] p-5 text-center" style={{ background: 'var(--night-card)', border: '1px solid color-mix(in oklch, var(--court) 45%, var(--night-line))' }}>
        <div className="flex items-center justify-center gap-2 text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: 'var(--court)' }}>
          <span aria-hidden>✓</span> Posted to standings
        </div>
        <div className="mono mt-2 text-[54px] font-bold leading-none" style={{ color: 'var(--court)' }}>{a}–{b}</div>
        <div className="mt-2 text-sm" style={{ color: 'var(--night-text2)' }}>
          {winner ? `${winner === 'a' ? teamALabel : teamBLabel} take it.` : 'Final.'}
        </div>
        {canScore && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="mt-4 rounded-full px-4 py-2 text-[12px] font-semibold"
            style={{ border: '1px solid var(--night-line)', color: 'var(--night-text2)' }}
          >
            Fix score
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-[18px] p-5" style={{ background: 'var(--night-card)', border: '1px solid var(--night-line)', borderLeft: `4px solid ${SPINE}` }}>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.08em]" style={{ color: 'var(--night-text3)' }}>
          {canScore && <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full" style={{ background: 'var(--serve)' }} />}
          Enter the score
        </div>
        <div className="mono text-[10px] uppercase tracking-[0.1em]" style={{ color: 'var(--night-text3)' }}>Game to {TARGET}, win by {WIN_BY}</div>
      </div>

      <TeamScoreRow label={teamALabel} accent="var(--court)" value={a} onChange={setA} onWin={() => quickWin('a')} winLabel={TARGET} mine={myTeam === 'a'} disabled={!canScore || pending} />
      <div className="my-2 flex items-center gap-3">
        <div className="h-px flex-1" style={{ background: 'var(--night-line)' }} />
        <span className="mono text-[10px] tracking-[0.12em]" style={{ color: 'var(--night-text3)' }}>VS</span>
        <div className="h-px flex-1" style={{ background: 'var(--night-line)' }} />
      </div>
      <TeamScoreRow label={teamBLabel} accent="var(--serve)" value={b} onChange={setB} onWin={() => quickWin('b')} winLabel={TARGET} mine={myTeam === 'b'} disabled={!canScore || pending} />

      {error && <div className="mt-3 text-[12.5px]" style={{ color: 'var(--serve)' }}>{error}</div>}

      {canScore ? (
        <button
          type="button"
          onClick={post}
          disabled={!valid || pending}
          className="mt-4 w-full rounded-2xl px-4 py-4 text-[16px] font-semibold disabled:cursor-not-allowed disabled:opacity-45"
          style={{ background: 'var(--court)', color: 'var(--night-court-ink)' }}
        >
          {pending ? 'Posting…' : done ? 'Update score' : 'Post final score'}
        </button>
      ) : (
        <div className="mt-3 text-center text-[12.5px]" style={{ color: 'var(--night-text3)' }}>
          This round is locked — scores can no longer change.
        </div>
      )}
      {canScore && !valid && (
        <div className="mt-2 text-center text-[11.5px]" style={{ color: 'var(--night-text3)' }}>
          A team needs {TARGET}+ and a {WIN_BY}-point lead to post.
        </div>
      )}
    </div>
  );
}

function TeamScoreRow({
  label,
  accent,
  value,
  onChange,
  onWin,
  winLabel,
  mine,
  disabled,
}: {
  label: string;
  accent: string;
  value: number;
  onChange: (n: number) => void;
  onWin: () => void;
  winLabel: number;
  mine: boolean;
  disabled: boolean;
}) {
  const btn = 'flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[22px] font-bold disabled:opacity-40';
  return (
    <div
      className="flex items-center gap-3 rounded-2xl p-3"
      style={{ background: mine ? `color-mix(in oklch, ${accent} 14%, var(--night-inset))` : 'var(--night-inset)', border: `1px solid color-mix(in oklch, ${accent} 35%, var(--night-line))` }}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: accent }} />
          <span className="truncate text-[14px] font-semibold">{mine ? `${label} (you)` : label}</span>
        </div>
      </div>
      <button type="button" aria-label={`Set ${label} to the winning score`} disabled={disabled} onClick={onWin} className="mono shrink-0 rounded-full px-2.5 py-1.5 text-[13px] font-bold disabled:opacity-40" style={{ border: `1px solid color-mix(in oklch, ${accent} 45%, var(--night-line))`, color: accent }}>{winLabel}</button>
      <button type="button" aria-label={`Remove a point from ${label}`} disabled={disabled || value <= 0} onClick={() => onChange(Math.max(0, value - 1))} className={btn} style={{ border: '1px solid var(--night-line)', color: 'var(--night-text)' }}>−</button>
      <span className="mono w-10 text-center text-[30px] font-bold" style={{ color: accent }}>{value}</span>
      <button type="button" aria-label={`Add a point to ${label}`} disabled={disabled || value >= 99} onClick={() => onChange(Math.min(99, value + 1))} className={btn} style={{ background: accent, color: 'var(--night-court-ink)' }}>+</button>
    </div>
  );
}
