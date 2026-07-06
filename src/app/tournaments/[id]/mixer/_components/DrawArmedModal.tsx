'use client';

import { useEffect, useState } from 'react';
import { drawMixerRound } from '../actions';
import { ActionForm } from './ActionForm';

// The draw "popup": the armed-draw ceremony from the design handoff. The
// cockpit's draw panel stays the at-a-glance summary; clicking Run the draw
// opens this focused modal — the weights, the seating plan, and the blind-vote
// guardrail restated one last time — with the real Run button inside. Keeping
// the fire behind a deliberate popup makes the draw feel like the moment it is
// and guards the irreversible step. Disabled (armed-after-lock) until ballots
// lock, mirroring the underlying RPC's guard.
export function DrawArmedModal({
  tournamentId,
  roundId,
  roundNo,
  canDraw,
  weights,
  teams,
  games,
  sittingPerRound,
  poolLabel,
}: {
  tournamentId: string;
  roundId: string;
  roundNo: number;
  canDraw: boolean;
  weights: { votes: number; skill: number; novelty: number };
  teams: number;
  games: number;
  sittingPerRound: number;
  poolLabel: string;
}) {
  const [open, setOpen] = useState(false);

  // Close on Escape while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!canDraw}
        className="w-full rounded-2xl px-4 py-4 text-[16px] font-semibold disabled:cursor-not-allowed disabled:opacity-45"
        style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
      >
        🎲 Run the draw
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center p-4"
          style={{ background: 'color-mix(in oklch, var(--ink) 55%, transparent)', backdropFilter: 'blur(3px)' }}
          role="dialog"
          aria-modal="true"
          aria-label={`Run the draw for round ${roundNo}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            className="w-full max-w-[440px] overflow-hidden rounded-[22px]"
            style={{ background: 'var(--surface-card)', border: '1px solid var(--line)', boxShadow: '0 24px 60px -12px color-mix(in oklch, var(--ink) 40%, transparent)' }}
          >
            <div className="p-6 text-center">
              <div className="mono text-[10px] uppercase tracking-[.16em]" style={{ color: 'var(--text3)' }}>
                Round {roundNo} · armed
              </div>
              <div className="serif mt-1 text-[30px] leading-none" style={{ color: 'var(--text)' }}>
                Run the draw?
              </div>
              <p className="mx-auto mt-2 max-w-[34ch] text-[13px]" style={{ color: 'var(--text2)' }}>
                Tokens seat <b style={{ color: 'var(--text)' }}>{teams} teams</b> across{' '}
                <b style={{ color: 'var(--text)' }}>{games} game{games === 1 ? '' : 's'}</b>
                {sittingPerRound > 0 ? ` · ${sittingPerRound} take a rotating bye` : ' · everyone plays'}. {poolLabel}
              </p>

              <div className="mt-4 flex gap-2">
                <WeightTile v={`${weights.votes}%`} l="Votes" />
                <WeightTile v={`${weights.skill}%`} l="Skill balance" />
                <WeightTile v={`${weights.novelty}%`} l="Novelty" />
              </div>

              <div
                className="mt-4 flex items-center gap-2 rounded-[10px] border border-dashed px-3 py-2.5 text-left text-[12px]"
                style={{ background: 'var(--surface-inset)', borderColor: 'var(--line-2)', color: 'var(--text3)' }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
                  <path d="M4 4l16 16M6.2 6.7C3.9 8.2 2.5 12 2.5 12s3.5 6.5 9.5 6.5c1.6 0 3-.45 4.2-1.1M10 5.8c.65-.13 1.3-.2 2-.2 6 0 9.5 6.4 9.5 6.4a17 17 0 01-2.3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
                Blind ballot — picks and tallies stay hidden. The draw reveals teams to every phone and the present screen at once.
              </div>
            </div>

            <div className="flex gap-2.5 border-t p-4" style={{ borderColor: 'var(--line)' }}>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex-1 rounded-2xl px-4 py-3 text-[14px] font-semibold"
                style={{ background: 'var(--surface-raise)', color: 'var(--text)', border: '1px solid var(--line-2)' }}
              >
                Not yet
              </button>
              <ActionForm action={drawMixerRound} className="flex-[1.4]" onResult={(r) => r.ok && setOpen(false)}>
                <input type="hidden" name="tournament_id" value={tournamentId} />
                <input type="hidden" name="round_id" value={roundId} />
                <button
                  type="submit"
                  className="w-full rounded-2xl px-4 py-3 text-[15px] font-bold"
                  style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
                >
                  🎲 Run the draw
                </button>
              </ActionForm>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function WeightTile({ v, l }: { v: string; l: string }) {
  return (
    <div className="flex-1 rounded-xl p-2.5 text-center" style={{ background: 'var(--surface-inset)', border: '1px solid var(--line)' }}>
      <div className="mono text-[19px] font-bold" style={{ color: 'var(--accent)' }}>{v}</div>
      <div className="mono mt-0.5 text-[9.5px] uppercase tracking-[.1em]" style={{ color: 'var(--text3)' }}>{l}</div>
    </div>
  );
}
