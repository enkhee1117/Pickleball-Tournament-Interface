'use client';

import { useEffect, useRef, useState } from 'react';

// Count-up stats band for the marketing landing. This is the only reason these
// numbers need the client (IntersectionObserver + rAF); the rest of the page is
// static server markup, so it lives in its own island.

const WRAP = 'mx-auto w-full max-w-[1140px] px-6';

function useCountUp(target: number, suffix: string) {
  const [val, setVal] = useState('0');
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVal(target + suffix);
      return;
    }
    let raf = 0;
    let start: number | null = null;
    const io = new IntersectionObserver((ents) => {
      ents.forEach((en) => {
        if (!en.isIntersecting) return;
        io.disconnect();
        const step = (t: number) => {
          if (start === null) start = t;
          const p = Math.min((t - start) / 900, 1);
          setVal(Math.round(target * (1 - Math.pow(1 - p, 3))) + suffix);
          if (p < 1) raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
      });
    }, { threshold: 0.6 });
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [target, suffix]);
  return { val, ref };
}

export function StatsStrip() {
  const a = useCountUp(1200, '+');
  const b = useCountUp(38, 'K+');
  const c = useCountUp(240, 'K+');
  return (
    <section style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--line)' }}>
      <div className={`${WRAP} grid grid-cols-1 gap-6 py-7 sm:grid-cols-3`}>
        {[
          { s: a, l: 'Events run' },
          { s: b, l: 'Players mixed' },
          { s: c, l: 'Partners drawn' },
        ].map((x, i) => (
          <div key={i} className="text-center">
            <div className="disp text-[clamp(26px,3.4vw,42px)] font-extrabold leading-none tracking-[-0.01em]" style={{ color: 'var(--accent)' }}>
              <span ref={x.s.ref}>{x.s.val}</span>
            </div>
            <div className="mono mt-2 text-[11px] uppercase tracking-[0.1em]" style={{ color: 'var(--text3)' }}>{x.l}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
