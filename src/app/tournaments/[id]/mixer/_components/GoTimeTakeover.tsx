'use client';

import { useEffect, useState } from 'react';
import { Avatar, type AvatarPlayer } from '@/components/ui/Avatar';

// notify.html touchpoint 3 — the go-time takeover. The last, loudest beat of
// the "you're up" chain: once EVERY team on your court has checked in, a
// full-screen takeover removes all ambiguity — huge court number, your team vs
// the opponent, and a single "On the court" button. Distinct from the court
// call (touchpoint 2, which nags you to check in) and the draw reveal (fires on
// the draw). Shows once per game (localStorage keyed on round+court+wave), is
// dismissable, and respects the roster's presence signal — never leaks picks.

const seenKey = (roundId: string, courtNo: number, waveNo: number) =>
  `ttd-mixer-gotime-${roundId}-${courtNo}-${waveNo}`;

export function GoTimeTakeover({
  roundId,
  courtNo,
  waveNo,
  yourAvatars,
  yourLabel,
  oppAvatars,
  oppLabel,
}: {
  roundId: string;
  courtNo: number;
  waveNo: number;
  yourAvatars: AvatarPlayer[];
  yourLabel: string;
  oppAvatars: AvatarPlayer[];
  oppLabel: string | null;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let seen = false;
    try {
      seen = !!window.localStorage.getItem(seenKey(roundId, courtNo, waveNo));
    } catch {
      seen = false;
    }
    // Defer a tick so a StrictMode double-mount can't flash it twice; the
    // cleanup cancels the pending open if we unmount first.
    if (seen) return;
    const t = window.setTimeout(() => setOpen(true), 0);
    return () => window.clearTimeout(t);
  }, [roundId, courtNo, waveNo]);

  function dismiss() {
    try {
      window.localStorage.setItem(seenKey(roundId, courtNo, waveNo), '1');
    } catch {
      /* private mode — replays next navigation, harmless */
    }
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Court ${courtNo} — it's go time`}
      className="fixed inset-0 z-[70] flex flex-col text-white"
      style={{
        background:
          'radial-gradient(ellipse 100% 60% at 50% 0%, color-mix(in oklch, var(--serve) 26%, transparent), transparent 60%), linear-gradient(180deg, oklch(0.16 0.03 40), oklch(0.11 0.02 264))',
      }}
    >
      <style>{`@keyframes ttdGoPop{0%{opacity:0;transform:translateY(14px) scale(.94)}100%{opacity:1;transform:none}}@keyframes ttdGoGlow{0%,100%{text-shadow:0 0 40px color-mix(in oklch,var(--serve) 55%,transparent)}50%{text-shadow:0 0 64px color-mix(in oklch,var(--serve) 80%,transparent)}}`}</style>

      {/* X close — same effect as the primary action. */}
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute right-4 top-4 z-10 grid h-10 w-10 place-items-center rounded-full"
        style={{ background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.16)', color: 'rgba(255,255,255,.8)' }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
      </button>

      <div className="flex flex-1 flex-col items-center justify-center px-7 text-center" style={{ animation: 'ttdGoPop .5s cubic-bezier(.2,.9,.3,1.2) both' }}>
        <div className="disp text-[120px] font-black leading-[0.85]" style={{ animation: 'ttdGoGlow 2s ease-in-out infinite' }}>
          {courtNo}
        </div>
        <div className="mono mt-1 text-[13px] uppercase tracking-[0.2em]" style={{ color: 'var(--serve)' }}>
          Take the court
        </div>
        {waveNo > 1 && (
          <div className="mono mt-1 text-[11px] uppercase tracking-[0.14em]" style={{ color: 'var(--court)' }}>Heat {waveNo}</div>
        )}
        <div className="serif mt-6 text-[38px] leading-none">It&apos;s go time.</div>

        <div className="mt-8 flex items-center gap-3.5">
          <TeamFaces avatars={yourAvatars} label={yourLabel} you />
          <span className="mono text-[14px] font-bold" style={{ color: 'rgba(255,255,255,.6)' }}>VS</span>
          {oppLabel ? <TeamFaces avatars={oppAvatars} label={oppLabel} /> : null}
        </div>
      </div>

      <div className="px-6 pb-9" style={{ paddingBottom: 'max(2.25rem, env(safe-area-inset-bottom))' }}>
        <button
          type="button"
          onClick={dismiss}
          className="w-full rounded-2xl py-4 text-[17px] font-extrabold"
          style={{ background: '#fff', color: 'oklch(0.16 0.03 40)' }}
        >
          On the court →
        </button>
        <div className="mt-3.5 text-center text-[13px]" style={{ color: 'rgba(255,255,255,.6)' }}>
          First serve — Court {courtNo}
        </div>
      </div>
    </div>
  );
}

function TeamFaces({ avatars, label, you }: { avatars: AvatarPlayer[]; label: string; you?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex">
        {avatars.map((a, i) => (
          <span key={i} className="rounded-full" style={{ marginLeft: i === 0 ? 0 : -12, boxShadow: '0 0 0 2px rgba(255,255,255,.3)' }}>
            <Avatar player={a} size={44} />
          </span>
        ))}
      </div>
      <div className="text-[13px] font-semibold" style={{ color: you ? 'var(--court)' : '#fff' }}>{label}</div>
    </div>
  );
}
