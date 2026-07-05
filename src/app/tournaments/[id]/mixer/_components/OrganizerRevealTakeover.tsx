'use client';

import { useEffect, useState } from 'react';

// The draw reveal for the organizer's cockpit — a once-per-round board of the
// courts the tokens just seated, so the organizer gets the moment too (not only
// the projector). localStorage-gated, reduced-motion aware, dismissible.

const seenKey = (roundId: string) => `ttd-mixer-oreveal-${roundId}`;

export type OrganizerRevealCourt = { label: string; teamA: string; teamB: string | null };

export function OrganizerRevealTakeover({
  roundId,
  roundNo,
  courts,
  sittingOut,
}: {
  roundId: string;
  roundNo: number;
  courts: OrganizerRevealCourt[];
  sittingOut: string[];
}) {
  const [phase, setPhase] = useState<'hidden' | 'spin' | 'reveal'>('hidden');

  useEffect(() => {
    if (courts.length === 0) return;
    let seen = false;
    try {
      seen = !!window.localStorage.getItem(seenKey(roundId));
    } catch {
      seen = false;
    }
    if (seen) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setPhase('reveal');
      return;
    }
    setPhase('spin');
    const t = window.setTimeout(() => setPhase('reveal'), 1400);
    return () => window.clearTimeout(t);
  }, [roundId, courts.length]);

  function dismiss() {
    try {
      window.localStorage.setItem(seenKey(roundId), '1');
    } catch {
      /* ignore */
    }
    setPhase('hidden');
  }

  if (phase === 'hidden') return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Round ${roundNo} draw`}
      className="fixed inset-0 z-[70] flex flex-col items-center justify-center overflow-y-auto px-6 py-10 text-center"
      style={{ background: 'radial-gradient(ellipse 90% 60% at 50% 25%, #16233b, #0a1120 70%)' }}
    >
      <style>{`@keyframes ttdOrevPop{0%{opacity:0;transform:translateY(10px) scale(.96)}100%{opacity:1;transform:none}}@keyframes ttdOrevPulse{0%,100%{opacity:.55}50%{opacity:1}}`}</style>
      <div className="mono text-[11px] font-bold uppercase tracking-[0.28em]" style={{ color: 'var(--court)' }}>
        Round {roundNo} · the tokens have spoken
      </div>

      {phase === 'spin' ? (
        <div className="serif mt-8 text-[38px] leading-tight text-white" style={{ animation: 'ttdOrevPulse 1s ease-in-out infinite' }}>
          Drawing the courts…
        </div>
      ) : (
        <div className="mt-6 w-full max-w-[820px]" style={{ animation: 'ttdOrevPop .5s cubic-bezier(.2,.9,.3,1.2) both' }}>
          <div className="serif text-[34px] leading-none text-white">Courts are set</div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {courts.map((c) => (
              <div key={c.label} className="rounded-2xl p-4 text-left" style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)' }}>
                <div className="mono text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--court)' }}>{c.label}</div>
                <div className="mt-1.5 text-[15px] font-semibold text-white">{c.teamA}</div>
                <div className="my-1 text-[10px]" style={{ color: 'rgba(255,255,255,.4)' }}>vs</div>
                <div className="text-[15px] font-semibold text-white">{c.teamB ?? '—'}</div>
              </div>
            ))}
          </div>
          {sittingOut.length > 0 && (
            <div className="mt-4 text-[13px]" style={{ color: 'rgba(255,255,255,.6)' }}>
              Sitting out ({sittingOut.length}): {sittingOut.join(', ')}
            </div>
          )}
          <button type="button" onClick={dismiss} className="mt-8 rounded-2xl px-8 py-3.5 text-[15px] font-bold" style={{ background: 'var(--court)', color: 'var(--night-court-ink)' }}>
            Send them to their courts →
          </button>
        </div>
      )}
    </div>
  );
}
