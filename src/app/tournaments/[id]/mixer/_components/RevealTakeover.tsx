'use client';

import { useEffect, useState } from 'react';

// In-app draw reveal (the projector ceremony, phone-native). When a round is
// drawn, every player gets a full-screen reveal of who the tokens paired them
// with — a short shuffle, then the partner + court settle in. Shows once per
// round (localStorage), respects reduced motion, and dismisses to the Match tab.
// Sit-out (rotating bye) players get their own "on the bench" reveal.

const seenKey = (roundId: string) => `ttd-mixer-reveal-${roundId}`;

type Phase = 'hidden' | 'spin' | 'reveal';

export function RevealTakeover({
  roundId,
  roundNo,
  courtNo,
  waveNo,
  partnerName,
  opponentTeam,
  sittingOut = false,
}: {
  roundId: string;
  roundNo: number;
  courtNo: number | null;
  waveNo?: number;
  partnerName: string | null;
  opponentTeam: string | null;
  sittingOut?: boolean;
}) {
  const [phase, setPhase] = useState<Phase>('hidden');

  useEffect(() => {
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
    const t = window.setTimeout(() => setPhase('reveal'), 1700);
    return () => window.clearTimeout(t);
  }, [roundId]);

  function dismiss() {
    try {
      window.localStorage.setItem(seenKey(roundId), '1');
    } catch {
      /* private mode — the reveal just replays next navigation, harmless */
    }
    setPhase('hidden');
  }

  if (phase === 'hidden') return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Round ${roundNo} draw`}
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center px-7 text-center"
      style={{ background: 'radial-gradient(ellipse 90% 60% at 50% 30%, #16233b, #0a1120 70%)' }}
    >
      <style>{`
        @keyframes ttdRevealPop{0%{opacity:0;transform:translateY(12px) scale(.94)}100%{opacity:1;transform:none}}
        @keyframes ttdRevealFade{0%{opacity:0}100%{opacity:1}}
        @keyframes ttdRevealPulse{0%,100%{opacity:.55}50%{opacity:1}}
        @keyframes ttdRevealConfetti{0%{transform:translateY(-10vh) rotate(0);opacity:1}100%{transform:translateY(105vh) rotate(720deg);opacity:.9}}
      `}</style>

      {/* X close — dismisses like the primary action. */}
      <button
        type="button"
        onClick={dismiss}
        aria-label="Close reveal"
        className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full"
        style={{ background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.16)', color: 'rgba(255,255,255,.8)' }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
      </button>

      {phase === 'reveal' && !sittingOut ? (
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          {Array.from({ length: 40 }, (_, i) => {
            const left = (i * 37) % 100;
            const delay = (i % 8) * 0.12;
            const dur = 2.3 + ((i % 5) * 0.35);
            const colors = ['var(--court)', 'oklch(0.7 0.19 48)', 'oklch(0.82 0.14 90)', '#fff', 'oklch(0.72 0.12 230)'];
            return (
              <span
                key={i}
                className="absolute top-0"
                style={{ left: `${left}%`, width: 8, height: 13, borderRadius: 2, background: colors[i % colors.length], animation: `ttdRevealConfetti ${dur}s linear ${delay}s forwards` }}
              />
            );
          })}
        </div>
      ) : null}

      <div className="relative mono text-[11px] font-bold uppercase tracking-[0.28em]" style={{ color: 'var(--court)', animation: 'ttdRevealFade .4s ease-out' }}>
        Round {roundNo} · the tokens have spoken
      </div>

      {phase === 'spin' ? (
        <div className="mt-8 flex flex-col items-center">
          <div className="serif text-[40px] leading-tight text-white" style={{ animation: 'ttdRevealPulse 1s ease-in-out infinite' }}>
            Who did the tokens pick?
          </div>
          <div className="mt-6 flex gap-2">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: 'var(--court)', animation: 'ttdRevealPulse 1s ease-in-out infinite', animationDelay: `${i * 0.18}s` }}
              />
            ))}
          </div>
        </div>
      ) : sittingOut ? (
        <div className="mt-8 flex flex-col items-center" style={{ animation: 'ttdRevealPop .5s cubic-bezier(.2,.9,.3,1.2) both' }}>
          <div className="text-[13px] font-semibold uppercase tracking-[0.14em] text-white/70">You&apos;re on the bench</div>
          <div className="serif mt-3 text-[38px] leading-tight text-white">Sitting this round out</div>
          <div className="mt-3 max-w-[300px] text-[14px] text-white/70">
            The teams didn&apos;t divide evenly, so you take a rotating bye — you&apos;re auto-seated next round.
          </div>
          <button type="button" onClick={dismiss} className="mt-9 rounded-2xl px-7 py-3.5 text-[15px] font-bold" style={{ background: 'var(--court)', color: 'var(--night-court-ink)' }}>
            Got it
          </button>
        </div>
      ) : (
        <div className="mt-7 flex w-full flex-col items-center" style={{ animation: 'ttdRevealPop .5s cubic-bezier(.2,.9,.3,1.2) both' }}>
          <div className="text-[13px] font-semibold uppercase tracking-[0.14em] text-white/70">You&apos;re playing with</div>
          <div className="serif mt-2 text-[44px] leading-[1.05] text-white">{partnerName ?? 'your partner'}</div>
          <div
            className="disp mt-6 text-[68px] font-black leading-none text-white"
            style={{ textShadow: '0 0 44px color-mix(in oklch, var(--serve) 55%, transparent)' }}
          >
            Court {courtNo}
          </div>
          {waveNo && waveNo > 1 && (
            <div className="mono mt-1 text-[11px] uppercase tracking-[0.14em]" style={{ color: 'var(--court)' }}>Heat {waveNo}</div>
          )}
          {opponentTeam && (
            <div className="mt-5 text-[15px] text-white/80">
              <span className="mono mr-2 text-[11px] uppercase tracking-[0.14em] text-white/50">vs</span>
              {opponentTeam}
            </div>
          )}
          <button
            type="button"
            onClick={dismiss}
            className="mt-9 rounded-2xl px-8 py-3.5 text-[15px] font-bold"
            style={{ background: 'var(--court)', color: 'var(--night-court-ink)' }}
          >
            Take the court →
          </button>
        </div>
      )}
    </div>
  );
}
