'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { BallMark } from '@/components/desktop';

// Public marketing front door (handoff "TourneyPal Landing.html"): a cosmic
// poster hero, mission-control tour, the crew, the vote→lock→draw→reveal
// loop, an interactive vote demo, features, scale band, and the Liberty 250
// celebration. Served at / for logged-out visitors; signed-in users get the
// dashboard. Uses the app theme tokens (light Sideline by default), escapes
// the 480 mobile shell, and honors prefers-reduced-motion.

const ARROW = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M5 12h13M12 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function MarketingLanding() {
  return (
    <div data-fullscreen style={{ background: 'var(--bg)', color: 'var(--text)' }}>
      <style>{`
        @keyframes ttdFadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:none}}
        @keyframes ttdFloatY{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}
        @keyframes ttdBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-14px)}}
        .ttd-land a{color:inherit;text-decoration:none}
        .ttd-fade{animation:ttdFadeUp .7s cubic-bezier(.2,.7,.3,1) both}
        .ttd-tilt{transition:transform .25s ease,border-color .25s,box-shadow .25s}
        .ttd-tilt:hover{transform:translateY(-5px);border-color:color-mix(in oklch,var(--accent) 42%,var(--line));box-shadow:0 20px 44px -22px rgba(0,0,0,.35)}
        @media (prefers-reduced-motion: reduce){.ttd-fade,.ttd-float,.ttd-bob{animation:none!important}}
      `}</style>
      <div className="ttd-land">
        <LandingNav />
        <Hero />
        <StatsStrip />
        <Showcase />
        <MissionControl />
        <Crew />
        <Loop />
        <Pocket />
        <Features />
        <ScaleBand />
        <Liberty />
        <CtaBand />
        <LandingFooter />
      </div>
    </div>
  );
}

const WRAP = 'mx-auto w-full max-w-[1140px] px-6';

function LandingNav() {
  return (
    <nav
      className="sticky top-0 z-50"
      style={{ backdropFilter: 'blur(14px)', background: 'color-mix(in oklch, var(--bg) 78%, transparent)', borderBottom: '1px solid var(--line)' }}
    >
      <div className={`${WRAP} flex h-16 items-center justify-between`}>
        <Link href="#top" className="flex items-center gap-2.5">
          <BallMark size={30} />
          <span className="serif text-[23px]" style={{ color: 'var(--text)' }}>Try to Dink</span>
        </Link>
        <div className="flex items-center gap-7">
          <a href="#mctrl" className="hidden text-sm font-medium sm:inline" style={{ color: 'var(--text2)' }}>Mission control</a>
          <a href="#crew" className="hidden text-sm font-medium sm:inline" style={{ color: 'var(--text2)' }}>The crew</a>
          <a href="#loop" className="hidden text-sm font-medium md:inline" style={{ color: 'var(--text2)' }}>How it works</a>
          <a href="#features" className="hidden text-sm font-medium md:inline" style={{ color: 'var(--text2)' }}>Features</a>
          <Link href="/login" className="btn btn-accent" style={{ padding: '10px 16px', fontSize: 14 }}>Open the app</Link>
        </div>
      </div>
    </nav>
  );
}

function Hero() {
  return (
    <header
      id="top"
      className="relative flex min-h-[88vh] items-center overflow-hidden text-white"
      style={{ background: 'oklch(0.16 0.08 275)' }}
    >
      <div className="absolute inset-0 z-0" style={{ background: "url('/design-handoff/scenes/galaxy-bg.png') center/cover no-repeat" }} aria-hidden />
      <div
        className="absolute inset-0 z-[1]"
        style={{
          background:
            'linear-gradient(100deg, oklch(0.13 0.07 270 / .92) 0%, oklch(0.14 0.08 275 / .74) 32%, oklch(0.15 0.09 280 / .28) 56%, transparent 78%), linear-gradient(0deg, oklch(0.12 0.06 270 / .7), transparent 34%)',
        }}
        aria-hidden
      />
      <div className={`${WRAP} relative z-[2] py-24`}>
        <div className="ttd-fade max-w-[38em]">
          <div className="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[12px] font-semibold" style={{ background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.24)' }}>
            <b style={{ color: 'oklch(0.86 0.14 90)' }}>★ 250</b> · Celebrating America&rsquo;s 250th
          </div>
          <div className="mt-4">
            <div className="disp text-[clamp(30px,6vw,48px)] font-extrabold leading-none tracking-[-0.01em]" style={{ color: 'rgba(255,255,255,.9)' }}>
              TRY TO
            </div>
            <div className="disp text-[clamp(76px,16vw,150px)] font-black leading-[0.86] tracking-[-0.02em]" style={{ color: 'var(--accent)', textShadow: '0 0 60px color-mix(in oklch, var(--accent) 45%, transparent)' }}>
              DINK
            </div>
          </div>
          <p className="mt-5 max-w-[34em] text-[clamp(16px,2vw,19px)] leading-relaxed" style={{ color: 'rgba(255,255,255,.82)' }}>
            Welcome to the pickleball galaxy — a whole little world where <b className="text-white">who you play with</b> is the entire game. Vote for partners, lock the ballot, and watch the draw drop live.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/signup" className="btn btn-accent btn-lg">Start an event {ARROW}</Link>
            <a href="#mctrl" className="btn btn-ghost btn-lg" style={{ color: '#fff', borderColor: 'rgba(255,255,255,.34)' }}>Tour mission control</a>
          </div>
          <div className="mt-9 flex flex-wrap gap-8">
            <HeroMeta big="16–50+" label="players per event" />
            <HeroMeta big="Blind" label="by design" />
            <HeroMeta big="Phone → TV" label="one app, every screen" />
          </div>
        </div>
      </div>
    </header>
  );
}

function HeroMeta({ big, label }: { big: string; label: string }) {
  return (
    <div className="flex flex-col">
      <b className="disp text-[24px]">{big}</b>
      <span className="mono mt-0.5 text-[11px] uppercase tracking-[0.08em]" style={{ color: 'rgba(255,255,255,.6)' }}>{label}</span>
    </div>
  );
}

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

function StatsStrip() {
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

function SecHead({ eyebrow, title, body, light, max }: { eyebrow: string; title: string; body?: string; light?: boolean; max?: string }) {
  return (
    <div className="mb-12" style={{ maxWidth: max ?? '36em' }}>
      <div className="eyebrow" style={light ? { color: 'oklch(0.86 0.15 90)' } : undefined}>{eyebrow}</div>
      <h2 className="serif mt-3 text-[clamp(30px,4vw,44px)] leading-none" style={{ color: light ? '#fff' : 'var(--text)' }}>{title}</h2>
      {body && <p className="mt-3 text-[17px]" style={{ color: light ? 'rgba(255,255,255,.76)' : 'var(--text2)' }}>{body}</p>}
    </div>
  );
}

function Showcase() {
  return (
    <section className="py-20">
      <div className={WRAP}>
        <div className="relative overflow-hidden rounded-[24px]" style={{ border: '1px solid var(--line)', boxShadow: '0 30px 70px -40px rgba(0,0,0,.5)' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/design-handoff/scenes/showcase.png" alt="Dink characters cheering courtside as partner pairings light up a giant board" className="block w-full object-cover" style={{ height: 'clamp(280px,46vw,560px)', objectPosition: 'center 30%' }} />
          <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-4 px-7 pb-6 pt-20" style={{ background: 'linear-gradient(to top, rgba(0,0,0,.82), rgba(0,0,0,.3) 55%, transparent)' }}>
            <div>
              <div className="eyebrow" style={{ color: 'oklch(0.86 0.15 90)' }}>Reveal night</div>
              <h3 className="serif mt-1 text-[clamp(24px,3vw,36px)] text-white">The moment the draw drops.</h3>
            </div>
            <p className="max-w-[30em] text-[14px]" style={{ color: 'rgba(255,255,255,.84)' }}>Phones up, partners revealed, the room loud. Try to Dink turns the pairing into the highlight of the night.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

const MC_CHIPS = ['Live bracket', 'Leaderboard', 'Blind token vote', 'Pooled betting', 'Raffle wheel', 'Live scores', 'Liberty 250 badge'];

function MissionControl() {
  return (
    <section id="mctrl" className="relative overflow-hidden py-20 text-white" style={{ background: 'oklch(0.15 0.07 275)' }}>
      <div className="absolute inset-0" style={{ background: "url('/design-handoff/scenes/galaxy-bg.png') center/cover", opacity: 0.32 }} aria-hidden />
      <div className={`${WRAP} relative z-[2]`}>
        <SecHead
          light
          max="42em"
          eyebrow="Mission control"
          title="The whole tournament, on one deck."
          body="Every feature runs from the galaxy control room — brackets, standings, the blind token vote, pooled betting, the raffle wheel, and live courtside scores. And this season, decked out for America's 250th."
        />
        <div className="relative overflow-hidden rounded-[24px]" style={{ border: '1px solid rgba(255,255,255,.16)', boxShadow: '0 40px 90px -50px #000' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/design-handoff/scenes/control-room-dinks.png" alt="A cosmic pickleball mission-control room full of Dink characters and glowing dashboards" className="block w-full object-cover" style={{ height: 'clamp(300px,42vw,560px)' }} />
          <div className="absolute inset-x-0 bottom-0 px-6 pb-6 pt-16" style={{ background: 'linear-gradient(to top, rgba(0,0,0,.8), transparent)' }}>
            <div className="flex flex-wrap gap-2.5">
              {MC_CHIPS.map((c, i) => (
                <span
                  key={c}
                  className="inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[13px] font-semibold text-white"
                  style={{ background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.2)', backdropFilter: 'blur(6px)' }}
                >
                  <i className="h-2 w-2 rounded-full" style={{ background: i === 5 ? 'oklch(0.7 0.19 40)' : i === 6 ? 'oklch(0.86 0.14 90)' : 'var(--accent)' }} />
                  {c}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const CREW = [
  { img: 'hype', role: 'The Hype', name: 'Dink', desc: 'The heart of the crew. Fists up the second the draw drops — pure reveal-night energy.' },
  { img: 'host', role: 'The Host', name: 'Ace', desc: 'Runs the show on the big screen. Welcomes players in and MCs the pairings live.' },
  { img: 'voter', role: 'The Voter', name: 'Pip', desc: 'Never spends a token without a plan. Stacks boosts on the partner she really wants.' },
  { img: 'champ', role: 'The Champ', name: 'Rex', desc: "Crowned at the last mixer and won't let anyone forget it. The trophy travels everywhere." },
  { img: 'winner', role: 'The Winner', name: 'Coin', desc: 'Cashed the pooled bet and pulled the raffle ticket. Some Dinks just have the luck.' },
  { img: 'rookie', role: 'The Rookie', name: 'Bo', desc: "Scanned the QR five minutes ago, already waving hello. Everyone's welcome on this court." },
];

function Crew() {
  return (
    <section id="crew" className="py-20" style={{ background: 'radial-gradient(80% 60% at 50% -10%, oklch(0.5 0.22 300 / .16), transparent 60%), var(--bg)' }}>
      <div className={WRAP}>
        <SecHead eyebrow="The cast" title="Meet the crew." body="Every mixer has its characters — ours just happen to be pickleballs. Here's who shows up on your screen, from first ballot to final trophy." max="40em" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CREW.map((c) => (
            <div key={c.name} className="ttd-tilt overflow-hidden rounded-[22px] px-6 pb-6 pt-6 text-center" style={{ border: '1px solid var(--line)', background: 'linear-gradient(180deg, color-mix(in oklch, oklch(0.55 0.2 300) 12%, var(--bg2)), var(--bg2))' }}>
              <div className="mx-auto mb-2 grid h-[150px] w-[150px] place-items-end" style={{ background: 'radial-gradient(circle at 50% 32%, oklch(0.72 0.16 300 / .5), oklch(0.5 0.2 285 / .25) 60%, transparent 72%)', borderRadius: '50%' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/design-handoff/characters/${c.img}.png`} alt="" style={{ height: 122, width: 'auto', filter: 'drop-shadow(0 10px 12px rgba(0,0,0,.35))' }} />
              </div>
              <div className="mono text-[10.5px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--accent)' }}>{c.role}</div>
              <h3 className="serif mt-1 text-[27px]" style={{ color: 'var(--text)' }}>{c.name}</h3>
              <p className="mt-1.5 text-[13.5px] leading-[1.5]" style={{ color: 'var(--text3)' }}>{c.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const LOOP = [
  { n: '01', t: 'Vote, blind', d: 'Spend tokens on the partners you want. Up, down, or buy a boost — no one sees your picks.' },
  { n: '02', t: 'Lock', d: 'The organizer closes voting. Ballots for the whole night lock together — no gaming the draw.' },
  { n: '03', t: 'Draw', d: 'Tokens become teams. A suspense beat as the algorithm shuffles toward the pairings.' },
  { n: '04', t: 'Reveal', d: 'Partners and courts drop in a full-screen moment — on every phone, and the big screen.' },
];

function Loop() {
  return (
    <section id="loop" className="py-20">
      <div className={WRAP}>
        <SecHead eyebrow="The heartbeat" title="Vote. Lock. Draw. Reveal." body="Every round runs the same four-beat loop — the part that turns a casual mixer into a show." />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {LOOP.map((s) => (
            <div key={s.n} className="ttd-tilt rounded-[18px] p-6" style={{ background: 'var(--bg2)', border: '1px solid var(--line)' }}>
              <div className="mb-1.5 grid h-[42px] w-[42px] place-items-center rounded-[11px]" style={{ background: 'var(--bg3)', color: 'var(--accent)' }}>●</div>
              <div className="mono text-[12px]" style={{ color: 'var(--accent)' }}>{s.n}</div>
              <h3 className="mt-3 text-[20px] font-semibold" style={{ color: 'var(--text)' }}>{s.t}</h3>
              <p className="mt-1.5 text-[13.5px]" style={{ color: 'var(--text3)' }}>{s.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Pocket() {
  return (
    <section className="py-20">
      <div className={`${WRAP} grid grid-cols-1 items-center gap-10 lg:grid-cols-[0.85fr_1.15fr]`}>
        <div className="flex justify-center lg:order-1">
          <VoteDemo />
        </div>
        <div>
          <div className="eyebrow">In your pocket</div>
          <h2 className="serif mt-3 text-[clamp(28px,3.6vw,40px)] leading-tight" style={{ color: 'var(--text)' }}>The whole night, run from one thumb.</h2>
          <p className="mt-3.5 max-w-[30em] text-[16.5px] leading-[1.55]" style={{ color: 'var(--text2)' }}>
            Players vote from the sofa; you open, lock, draw, score, and settle prizes courtside. The blind ballot keeps every pick secret — even from you — until the draw fires.
          </p>
          <div className="mt-6">
            <Link href="/login" className="btn btn-accent btn-lg">Open the app {ARROW}</Link>
          </div>
        </div>
      </div>
    </section>
  );
}

const DEMO_ROWS = [
  { avatar: 'p6', name: 'Eli Brooks', start: 2 },
  { avatar: 'p3', name: 'Theo Kim', start: 0 },
  { avatar: 'p4', name: 'Alex Park', start: 1 },
];
const DEMO_TOTAL = 6;

function VoteDemo() {
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

const FEATURES = [
  { t: 'Blind by design', d: 'Votes, tallies, and pairings stay hidden from everyone — including the admin — until the draw.' },
  { t: 'A token economy', d: 'One budget for the night. Spread it across rounds, stack downvotes, or overpay for a boost.' },
  { t: 'The reveal moment', d: 'Lock → draw → reveal plays like a game show, with a presentation mode for the projector.' },
  { t: 'Pooled betting', d: 'Friendly markets on who takes the night — chips, live odds, and payouts that keep everyone watching.' },
  { t: 'Raffle draw', d: 'Earn tickets by being a wanted teammate. Everyone can win something, champion or not.' },
  { t: 'Anonymous join', d: "Tap a QR, pick a name, you're in — no signup. Upgrade to a real account any time, keeping your tokens." },
  { t: 'Run it from your phone', d: 'Open, lock, draw, score, and settle prizes courtside. Advance a whole event in a few taps.' },
  { t: 'One app, every screen', d: 'A single responsive build for phone, tablet, desktop, and a big-screen presentation mode.' },
  { t: 'Configurable economy', d: 'Set the token budget, boost price and limits, lock mode, payment methods, and prize split.' },
];

function Features() {
  return (
    <section id="features" className="py-20">
      <div className={WRAP}>
        <SecHead eyebrow="What's inside" title="A social mixer with a brain." body="Everything you need to run a lively, fair, and genuinely fun event — for players and organizers alike." />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.t} className="ttd-tilt rounded-[18px] p-6" style={{ background: 'var(--bg2)', border: '1px solid var(--line)' }}>
              <div className="mb-4 grid h-10 w-10 place-items-center rounded-[11px]" style={{ background: 'var(--bg3)', color: 'var(--accent)' }}>◆</div>
              <h3 className="text-[18px] font-semibold" style={{ color: 'var(--text)' }}>{f.t}</h3>
              <p className="mt-1.5 text-[14px]" style={{ color: 'var(--text3)' }}>{f.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const SCALE = [
  { img: 'club', num: '16–32', t: 'Club night', d: 'Anonymous QR join, no accounts needed, ephemeral. Show up and play.' },
  { img: 'league', num: '∞', t: 'Recurring league', d: 'Persistent identities and season-long raffle and betting arcs.' },
  { img: 'tourney', num: '50+', t: 'Large tournament', d: 'Multiple courts with smart sit-out rotation that keeps everyone moving.' },
];

function ScaleBand() {
  return (
    <section id="scale" className="py-20" style={{ background: 'var(--bg2)', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
      <div className={WRAP}>
        <SecHead eyebrow="One product, three modes" title="From club night to big tournament." />
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
          {SCALE.map((s) => (
            <div key={s.t}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/design-handoff/scenes/${s.img}.png`} alt="" className="mb-4 w-full rounded-[16px] object-cover" style={{ height: 188, border: '1px solid var(--line)' }} />
              <div className="disp text-[40px] font-extrabold leading-none" style={{ color: 'var(--accent)' }}>{s.num}</div>
              <h3 className="mt-2 text-[20px] font-semibold" style={{ color: 'var(--text)' }}>{s.t}</h3>
              <p className="mt-2.5 text-[14px]" style={{ color: 'var(--text3)' }}>{s.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Liberty() {
  return (
    <section className="relative overflow-hidden text-white" style={{ background: 'linear-gradient(120deg, oklch(0.27 0.1 262), oklch(0.33 0.13 264) 55%, oklch(0.29 0.11 270))' }}>
      <div className="absolute inset-0" style={{ opacity: 0.09, background: 'repeating-linear-gradient(180deg,#fff 0 22px, transparent 22px 44px)' }} aria-hidden />
      <div className={`${WRAP} relative z-[2] py-[74px] text-center`}>
        <div className="inline-flex items-center gap-2 rounded-full px-4 py-[7px] text-[12px] font-bold tracking-[0.1em]" style={{ background: 'linear-gradient(90deg, oklch(0.55 0.2 25 / .9), oklch(0.42 0.14 258 / .9))', border: '1px solid rgba(255,255,255,.28)' }}>
          ★ 250 · LIBERTY EDITION
        </div>
        <h2 className="serif mx-auto mt-4 text-[clamp(30px,4.5vw,48px)] text-white">
          Play it forward for America&rsquo;s <em className="italic" style={{ color: 'oklch(0.86 0.14 90)' }}>250th.</em>
        </h2>
        <p className="mx-auto mt-3.5 max-w-[38em] text-[16.5px] leading-[1.6]" style={{ color: 'rgba(255,255,255,.85)' }}>
          Pickleball is a home-grown American game — and 2026 marks the nation&rsquo;s 250th. Flip on the opt-in <b className="text-white">Liberty</b> theme for a fireworks reveal, red-white-blue confetti, and a commemorative badge. Court green still means go; the stars &amp; stripes just come along to celebrate.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/signup" className="btn btn-accent btn-lg">Start a Liberty event {ARROW}</Link>
          <a href="#mctrl" className="btn btn-ghost btn-lg" style={{ color: '#fff', borderColor: 'rgba(255,255,255,.34)' }}>See the theme</a>
        </div>
      </div>
    </section>
  );
}

function CtaBand() {
  return (
    <section className="py-20 text-center">
      <div className={WRAP}>
        <div className="rounded-[28px] px-8 py-16" style={{ background: 'linear-gradient(160deg, color-mix(in oklch, var(--accent) 16%, var(--bg2)), var(--bg2))', border: '1px solid color-mix(in oklch, var(--accent) 30%, var(--line))' }}>
          <h2 className="serif text-[clamp(30px,4.5vw,48px)]" style={{ color: 'var(--text)' }}>Make your next mixer a game.</h2>
          <p className="mx-auto mb-7 mt-3.5 max-w-[30em] text-[17px]" style={{ color: 'var(--text2)' }}>Spin up an event in minutes — invite by link, run it from your phone, and let the draw do the talking.</p>
          <Link href="/signup" className="btn btn-accent btn-lg">Start an event {ARROW}</Link>
        </div>
      </div>
    </section>
  );
}

function LandingFooter() {
  return (
    <footer style={{ borderTop: '1px solid var(--line)' }}>
      <div className={`${WRAP} flex flex-wrap items-center justify-between gap-4 py-10`}>
        <div className="flex items-center gap-2.5">
          <BallMark size={26} />
          <span className="serif text-[20px]" style={{ color: 'var(--text)' }}>Try to Dink</span>
        </div>
        <div className="text-[13px]" style={{ color: 'var(--text3)' }}>Energetic, blind, and kind — pickleball mixers that feel like a show.</div>
      </div>
    </footer>
  );
}
