'use client';

import { useState } from 'react';

// The interactive blind-ballot mock on the marketing landing — tap +/- to spend
// tokens. The only interactive piece of the "In your pocket" section, so it's
// its own client island; the surrounding markup stays server-rendered. The
// ttdFloatY keyframes it animates with are defined in MarketingLanding's global
// <style>, which applies here since this renders inside that subtree.

const DEMO_ROWS = [
  { avatar: 'p6', name: 'Eli Brooks', start: 2 },
  { avatar: 'p3', name: 'Theo Kim', start: 0 },
  { avatar: 'p4', name: 'Alex Park', start: 1 },
];
const DEMO_TOTAL = 6;

export function VoteDemo() {
  const [counts, setCounts] = useState<number[]>(DEMO_ROWS.map((r) => r.start));
  const spent = counts.reduce((a, c) => a + c, 0);
  const left = DEMO_TOTAL - spent;
  const bump = (i: number, dir: 1 | -1) => {
    setCounts((prev) => {
      const next = [...prev];
      if (dir === 1) {
        if (prev.reduce((a, c) => a + c, 0) < DEMO_TOTAL) next[i] = next[i] + 1;
      } else if (next[i] > 0) {
        next[i] = next[i] - 1;
      }
      return next;
    });
  };
  return (
    <div
      className="ttd-float relative w-[300px] overflow-hidden"
      style={{ border: '8px solid #0a0a0c', borderRadius: 42, background: 'var(--bg)', boxShadow: '0 40px 90px rgba(0,0,0,0.4)', animation: 'ttdFloatY 6.5s 1s ease-in-out infinite' }}
    >
      <div className="absolute left-1/2 top-2 z-[5] h-6 w-24 -translate-x-1/2 rounded-2xl" style={{ background: '#0a0a0c' }} />
      <div className="px-3.5 pb-4 pt-10">
        <div className="flex items-center justify-between rounded-[14px] px-3 py-3" style={{ background: 'color-mix(in oklch, var(--accent) 13%, var(--bg2))', border: '1px solid color-mix(in oklch, var(--accent) 38%, transparent)' }}>
          <div>
            <span className="pill mono inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.07em]" style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}>
              <i className="h-[5px] w-[5px] rounded-full" style={{ background: 'var(--accent-ink)' }} /> Ballot open
            </span>
            <b className="disp mt-1.5 block text-[14px]" style={{ color: 'var(--text)' }}>Blind ballot · 5 rounds</b>
          </div>
        </div>
        <div className="my-2.5 flex items-center gap-1.5 rounded-[14px] px-3 py-3" style={{ background: 'var(--bg2)', border: '1px solid var(--line)' }}>
          <div className="flex flex-1 gap-[3px]">
            {Array.from({ length: DEMO_TOTAL }).map((_, i) => (
              <span key={i} className="h-[14px] w-[14px] rounded-full" style={i < spent ? { background: 'var(--accent)' } : { border: '1.5px dashed var(--line)' }} />
            ))}
          </div>
          <span className="disp text-[18px] font-extrabold" style={{ color: 'var(--text)' }}>{left}</span>
        </div>
        {DEMO_ROWS.map((r, i) => {
          const c = counts[i];
          return (
            <div key={r.name} className="mb-2 flex items-center gap-2.5 rounded-[13px] p-2.5" style={{ background: 'var(--bg2)', border: `1px solid ${c > 0 ? 'color-mix(in oklch, var(--accent) 45%, var(--line))' : 'var(--line)'}` }}>
              <span className="h-9 w-9 overflow-hidden rounded-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/design-handoff/avatars/${r.avatar}.png`} alt="" className="h-full w-full object-cover" style={{ objectPosition: 'center top' }} />
              </span>
              <span className="disp flex-1 text-[13px] font-bold" style={{ color: 'var(--text)' }}>{r.name}</span>
              <button type="button" onClick={() => bump(i, -1)} aria-label={`Downvote ${r.name}`} className="grid h-8 w-8 place-items-center rounded-[9px] text-[13px] font-bold" style={{ border: '1.5px solid var(--line)', color: 'var(--text2)' }}>−</button>
              <button
                type="button"
                onClick={() => bump(i, 1)}
                aria-label={`Upvote ${r.name}`}
                className="grid h-8 w-8 place-items-center rounded-[9px] text-[13px] font-bold"
                style={c > 0 ? { background: 'var(--accent)', color: 'var(--accent-ink)' } : { background: 'color-mix(in oklch, var(--accent) 16%, transparent)', border: '1.5px solid color-mix(in oklch, var(--accent) 55%, transparent)', color: 'var(--accent)' }}
              >
                {c > 0 ? `+${c}` : '+'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
