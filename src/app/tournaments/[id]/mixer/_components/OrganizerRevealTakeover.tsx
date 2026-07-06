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
      <style>{`
        @keyframes ttdOrevPop{0%{opacity:0;transform:translateY(14px) scale(.94)}100%{opacity:1;transform:none}}
        @keyframes ttdOrevPulse{0%,100%{opacity:.55}50%{opacity:1}}
        @keyframes ttdOrevReel{0%{transform:translateY(-3px)}50%{transform:translateY(3px)}100%{transform:translateY(-3px)}}
        @keyframes ttdOrevConfetti{0%{transform:translateY(-10vh) rotate(0);opacity:1}100%{transform:translateY(105vh) rotate(720deg);opacity:.9}}
      `}</style>

      {/* X close — always available; same effect as the primary action. */}
      <button
        type="button"
        onClick={dismiss}
        aria-label="Close reveal"
        className="absolute right-5 top-5 grid h-10 w-10 place-items-center rounded-full"
        style={{ background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.16)', color: 'rgba(255,255,255,.8)' }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
      </button>

      <div className="mono text-[11px] font-bold uppercase tracking-[0.28em]" style={{ color: 'var(--court)' }}>
        Round {roundNo} · the tokens have spoken
      </div>

      {phase === 'spin' ? (
        <div className="mt-8 flex flex-col items-center gap-4">
          <div className="serif text-[38px] leading-tight text-white" style={{ animation: 'ttdOrevPulse 1s ease-in-out infinite' }}>
            Drawing the courts…
          </div>
          <div className="flex gap-2" aria-hidden>
            {[0, 1, 2].map((i) => (
              <span key={i} className="h-2.5 w-2.5 rounded-full" style={{ background: 'var(--court)', animation: `ttdOrevReel .6s ease-in-out ${i * 0.12}s infinite` }} />
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* Confetti burst on the reveal. */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
            {Array.from({ length: 44 }, (_, i) => {
              const left = (i * 37) % 100;
              const delay = (i % 8) * 0.12;
              const dur = 2.4 + ((i % 5) * 0.35);
              const colors = ['var(--court)', 'oklch(0.7 0.19 48)', 'oklch(0.82 0.14 90)', '#fff', 'oklch(0.72 0.12 230)'];
              return (
                <span
                  key={i}
                  className="absolute top-0"
                  style={{
                    left: `${left}%`,
                    width: 9,
                    height: 14,
                    borderRadius: 2,
                    background: colors[i % colors.length],
                    animation: `ttdOrevConfetti ${dur}s linear ${delay}s forwards`,
                  }}
                />
              );
            })}
          </div>

          <div className="relative mt-6 w-full max-w-[820px]" style={{ animation: 'ttdOrevPop .5s cubic-bezier(.2,.9,.3,1.2) both' }}>
            <div className="serif text-[34px] leading-none text-white">Courts are set</div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {courts.map((c, i) => (
                <div
                  key={c.label}
                  className="rounded-2xl p-4 text-left"
                  style={{
                    background: 'rgba(255,255,255,.06)',
                    border: '1px solid rgba(255,255,255,.12)',
                    animation: `ttdOrevPop .5s cubic-bezier(.2,1.3,.5,1) ${0.15 + i * 0.12}s both`,
                  }}
                >
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
        </>
      )}
    </div>
  );
}
