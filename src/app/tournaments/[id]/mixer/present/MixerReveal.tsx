'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { GALAXY_BG } from '@/lib/demo-roster';
import { BallMark } from '@/components/desktop/BallMark';
import { MixerRealtimeSync } from '../MixerRealtimeSync';

// The projector reveal (handoff present-a "Big Board" + present-b "Center
// Stage"). A fixed 1920×1080 show stage, JS-fit-scaled, on the pinned Night
// show theme. Two choreographies share the stage chrome and the same real
// draw data; the organizer picks the style. Entrance animation is gated on
// prefers-reduced-motion — reduced motion jumps straight to the settled board.

export type RevealPlayer = { id: string; name: string; dupr: number | null };
export type RevealCourt = { courtNo: number; teamA: RevealPlayer[]; teamB: RevealPlayer[] };

const firstName = (n: string) => n.split(' ')[0];
const initials = (n: string) =>
  n.split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
const teamName = (team: RevealPlayer[]) => team.map((p) => firstName(p.name)).join(' & ');
const combined = (team: RevealPlayer[]) => {
  const vals = team.map((p) => p.dupr).filter((d): d is number => typeof d === 'number');
  if (vals.length < team.length || vals.length === 0) return null;
  return vals.reduce((s, d) => s + d, 0).toFixed(1);
};

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

function useFitScale() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function fit() {
      const el = ref.current;
      if (!el) return;
      const s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080) || 1;
      el.style.transform = `scale(${s})`;
    }
    fit();
    window.addEventListener('resize', fit);
    const ro = new ResizeObserver(fit);
    ro.observe(document.documentElement);
    return () => {
      window.removeEventListener('resize', fit);
      ro.disconnect();
    };
  }, []);
  return ref;
}

function Face({ name, size, ring, done }: { name: string; size: number; ring?: boolean; done?: boolean }) {
  return (
    <span
      className={`av${ring ? ' ring' : ''}`}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.34,
        color: 'var(--court-deep)',
        background: 'var(--surface-raise)',
        border: `${Math.max(3, size * 0.03)}px solid var(--bg2)`,
        boxShadow: done ? '0 0 0 3px var(--bg2), 0 0 0 6px rgba(150,215,95,.72)' : undefined,
      }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

function Confetti({ fire, count = 74 }: { fire: boolean; count?: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }).map((_, i) => ({
        left: 4 + ((i * 37) % 92),
        top: 46 + ((i * 13) % 22),
        delay: ((i * 7) % 50) / 100,
        rot: (i * 47) % 360,
        color: ['var(--accent)', 'var(--amber)', 'var(--sky)', '#fff', 'var(--serve)'][i % 5],
      })),
    [count],
  );
  if (!fire) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-[9] overflow-hidden" aria-hidden>
      {pieces.map((p, i) => (
        <i
          key={i}
          className="absolute h-[17px] w-[11px] rounded-[2px]"
          style={{
            left: `${p.left}%`,
            top: `${p.top}%`,
            background: p.color,
            transform: `rotate(${p.rot}deg)`,
            animation: `ttdConfetti 2.6s ease-out ${p.delay}s forwards`,
          }}
        />
      ))}
    </div>
  );
}

function TopBar({ eventName, roundNo }: { eventName: string; roundNo: number }) {
  return (
    <div className="absolute left-0 right-0 top-0 z-10 flex h-24 items-center justify-between px-14">
      <div className="flex items-center gap-3" style={{ color: 'var(--text)' }}>
        <BallMark size={36} />
        <span className="serif text-[28px]" style={{ color: 'var(--text2)' }}>
          Try to Dink
        </span>
      </div>
      <div className="flex items-center gap-3.5">
        <span
          className="mono rounded-full px-[11px] py-[5px] text-[10.5px] font-bold text-white"
          style={{ background: 'linear-gradient(90deg, oklch(0.55 0.2 25 / .92), oklch(0.42 0.14 258 / .92))' }}
        >
          ★ 250
        </span>
        <span className="chip chip-live">
          <span className="dot" />
          Live draw
        </span>
        <span className="serif text-[24px]" style={{ color: 'var(--text2)' }}>
          {eventName}
        </span>
        <span className="chip">Round {roundNo}</span>
      </div>
    </div>
  );
}

function Controls({
  tournamentId,
  variant,
  onReplay,
}: {
  tournamentId: string;
  variant: 'board' | 'stage';
  onReplay: () => void;
}) {
  return (
    <>
      {/* style switch — top-left, mirrors the reveal aesthetic */}
      <div className="fixed left-5 top-5 z-30 flex items-center gap-1.5 rounded-full p-[5px]"
        style={{ background: 'oklch(0.16 0.02 264 / .8)', border: '1px solid var(--line-2)' }}
      >
        {(['board', 'stage'] as const).map((v) => (
          <Link
            key={v}
            href={`/tournaments/${tournamentId}/mixer/present?style=${v}`}
            replace
            scroll={false}
            className="mono rounded-full px-3.5 py-[6px] text-[11px] uppercase tracking-[.08em]"
            style={
              variant === v
                ? { background: 'var(--accent)', color: 'var(--accent-ink)', fontWeight: 700 }
                : { color: 'var(--text3)' }
            }
          >
            {v === 'board' ? 'Big Board' : 'Center Stage'}
          </Link>
        ))}
      </div>

      {/* replay + exit — bottom-right */}
      <div className="fixed bottom-5 right-5 z-30 flex items-center gap-2.5">
        <Link
          href={`/tournaments/${tournamentId}/mixer/present/between`}
          className="mono rounded-full px-[15px] py-[9px] text-[12px] uppercase tracking-[.1em]"
          style={{ background: 'color-mix(in oklch, var(--bg2) 70%, transparent)', border: '1px solid var(--line-2)', color: 'var(--text2)' }}
        >
          Between board →
        </Link>
        <button
          type="button"
          onClick={onReplay}
          className="mono rounded-full px-[15px] py-[9px] text-[12px] uppercase tracking-[.1em]"
          style={{ background: 'color-mix(in oklch, var(--bg2) 70%, transparent)', border: '1px solid var(--line-2)', color: 'var(--text2)' }}
        >
          ↻ Replay reveal
        </button>
      </div>
      <Link
        href={`/tournaments/${tournamentId}`}
        className="mono fixed bottom-5 left-5 z-30 rounded-full px-[15px] py-[9px] text-[12px] uppercase tracking-[.1em]"
        style={{ background: 'color-mix(in oklch, var(--bg2) 70%, transparent)', border: '1px solid var(--line-2)', color: 'var(--text3)' }}
      >
        ← Exit
      </Link>
    </>
  );
}

const KEYFRAMES = `
@keyframes ttdConfetti { to { transform: translateY(560px) rotate(540deg); opacity: 0; } }
@keyframes ttdSweep { 0%,100% { transform: translateX(-58%) rotate(-4deg); } 50% { transform: translateX(-42%) rotate(4deg); } }
@keyframes ttdPop { 0% { transform: scale(.6); } 60% { transform: scale(1.08); } 100% { transform: scale(1); } }
@keyframes ttdSlideUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
`;

// ---------------------------------------------------------------------------
// Big Board — all courts on one board; reels spin then settle court-by-court.
// ---------------------------------------------------------------------------
function BigBoard({
  courts,
  pool,
  roundNo,
  tokensCast,
  playersIn,
  teamsToDraw,
  runId,
  reduced,
}: {
  courts: RevealCourt[];
  pool: string[];
  roundNo: number;
  tokensCast: number;
  playersIn: number;
  teamsToDraw: number;
  runId: number;
  reduced: boolean;
}) {
  const [phase, setPhase] = useState<'lock' | 'board'>(reduced ? 'board' : 'lock');
  const [settled, setSettled] = useState<boolean[]>(() => courts.map(() => reduced));
  const [revealed, setRevealed] = useState(reduced);
  const [reelTick, setReelTick] = useState(0);

  useEffect(() => {
    if (reduced) {
      setPhase('board');
      setSettled(courts.map(() => true));
      setRevealed(true);
      return;
    }
    const timers: number[] = [];
    const t = (fn: () => void, ms: number) => timers.push(window.setTimeout(fn, ms));
    setPhase('lock');
    setSettled(courts.map(() => false));
    setRevealed(false);

    t(() => setPhase('board'), 2100);
    // court i settles at 2100 + 1500 + i*900
    courts.forEach((_, i) => {
      t(() => setSettled((prev) => prev.map((v, j) => (j === i ? true : v))), 2100 + 1500 + i * 900);
    });
    const revealAt = 2100 + 1500 + Math.max(0, courts.length - 1) * 900 + 700;
    t(() => setRevealed(true), revealAt);

    const reel = window.setInterval(() => setReelTick((x) => x + 1), 90);
    timers.push(reel);
    return () => timers.forEach((id) => window.clearTimeout(id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, reduced, courts.length]);

  const cols = Math.min(courts.length || 1, 3);
  return (
    <>
      {/* LOCK */}
      <div
        className="absolute inset-0 flex flex-col items-center justify-center transition-opacity duration-300"
        style={{ opacity: phase === 'lock' ? 1 : 0, pointerEvents: 'none' }}
      >
        <span className="animate-floatY" style={{ color: 'var(--amber)' }} aria-hidden>
          <svg width="76" height="76" viewBox="0 0 24 24" fill="none">
            <rect x="5" y="10.5" width="14" height="10.5" rx="2.2" stroke="currentColor" strokeWidth="1.6" />
            <path d="M8 10.5V8a4 4 0 018 0v2.5" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        </span>
        <div className="serif mt-1.5 text-[96px] leading-[.96]" style={{ color: 'var(--text)' }}>
          Ballots locked.
        </div>
        <div className="mt-3.5 text-[24px]" style={{ color: 'var(--text2)' }}>
          Every token is spent. No take-backs — the draw decides now.
        </div>
        <div className="mt-8 flex gap-10">
          {[
            [tokensCast, 'Tokens cast'],
            [playersIn, 'Players in'],
            [teamsToDraw, 'Teams to draw'],
          ].map(([v, l]) => (
            <div key={l as string} className="text-center">
              <div className="mono text-[52px] font-bold tracking-[-.03em]" style={{ color: 'var(--accent)' }}>
                {v as number}
              </div>
              <div className="mono mt-1 text-[12px] uppercase tracking-[.14em]" style={{ color: 'var(--text3)' }}>
                {l as string}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* BOARD */}
      <div
        className="absolute inset-0 flex flex-col items-center justify-center transition-opacity duration-300"
        style={{ opacity: phase === 'board' ? 1 : 0, pointerEvents: 'none' }}
      >
        <div className="mb-8 text-center">
          <div className="mono text-[14px] uppercase tracking-[.16em]" style={{ color: 'var(--accent)' }}>
            {revealed ? `Round ${roundNo} pairings` : 'Drawing partners'}
          </div>
          <div className="serif mt-2 text-[68px] leading-[.98]" style={{ color: 'var(--text)' }}>
            {revealed ? (
              <>
                Take your <em className="serif-i" style={{ color: 'var(--accent)' }}>courts.</em>
              </>
            ) : (
              <>Who did the tokens&nbsp;pick?</>
            )}
          </div>
        </div>
        <div className="grid gap-7" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, width: cols * 540 }}>
          {courts.map((c, i) => (
            <BoardCourt key={c.courtNo} court={c} pool={pool} settled={settled[i]} reelTick={reelTick} />
          ))}
        </div>
      </div>
    </>
  );
}

function BoardCourt({
  court,
  pool,
  settled,
  reelTick,
}: {
  court: RevealCourt;
  pool: string[];
  settled: boolean;
  reelTick: number;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-[26px] px-7 pb-8 pt-[30px]"
      style={{
        background: 'oklch(0.22 0.03 264)',
        border: settled ? '1px solid oklch(0.6 0.15 140)' : '1px solid var(--line-2)',
        boxShadow: settled ? '0 30px 70px -30px rgba(150,215,95,.30)' : undefined,
        animation: settled ? 'ttdPop .55s cubic-bezier(.2,1.3,.5,1)' : undefined,
      }}
    >
      <div className="mb-5 flex items-center justify-between">
        <span className="mono text-[14px] uppercase tracking-[.12em]" style={{ color: 'var(--text3)' }}>
          Court
        </span>
        <span className="disp text-[20px] font-extrabold" style={{ color: 'var(--accent)' }}>
          {court.courtNo}
        </span>
      </div>
      <BoardTeam team={court.teamA} pool={pool} settled={settled} reelTick={reelTick} seed={court.courtNo} />
      <div className="my-3.5 flex items-center gap-3.5">
        <div className="h-px flex-1" style={{ background: 'var(--line-2)' }} />
        <div className="mono text-[15px] font-bold tracking-[.18em]" style={{ color: 'var(--text3)' }}>
          VS
        </div>
        <div className="h-px flex-1" style={{ background: 'var(--line-2)' }} />
      </div>
      <BoardTeam team={court.teamB} pool={pool} settled={settled} reelTick={reelTick} seed={court.courtNo + 7} />
    </div>
  );
}

function BoardTeam({
  team,
  pool,
  settled,
  reelTick,
  seed,
}: {
  team: RevealPlayer[];
  pool: string[];
  settled: boolean;
  reelTick: number;
  seed: number;
}) {
  const combo = combined(team);
  return (
    <div className="flex items-center gap-4 py-1.5">
      <div className="flex">
        {team.map((p, i) => {
          const spinName = pool.length ? pool[(reelTick + seed + i * 3) % pool.length] : p.name;
          return (
            <span key={p.id} style={{ marginLeft: i === 1 ? -22 : 0 }}>
              <Face name={settled ? p.name : spinName} size={86} done={settled} />
            </span>
          );
        })}
      </div>
      <div style={settled ? { animation: 'ttdSlideUp .5s ease both' } : { visibility: 'hidden' }}>
        <div className="disp text-[30px] font-extrabold leading-[1.05] tracking-[-.01em]" style={{ color: 'var(--text)' }}>
          {teamName(team)}
        </div>
        <div className="mono mt-0.5 text-[13px]" style={{ color: 'var(--text3)' }}>
          {combo ? `${combo} combined` : `Round pairing`}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Center Stage — sequential court spotlight with a filling summary rail.
// ---------------------------------------------------------------------------
function CenterStage({
  courts,
  roundNo,
  tokensCast,
  teamsToDraw,
  runId,
  reduced,
}: {
  courts: RevealCourt[];
  roundNo: number;
  tokensCast: number;
  teamsToDraw: number;
  runId: number;
  reduced: boolean;
}) {
  const [phase, setPhase] = useState<'lock' | 'court' | 'finale'>(reduced ? 'finale' : 'lock');
  const [idx, setIdx] = useState(0);
  const [sub, setSub] = useState({ label: false, a: false, b: false, vs: false });
  const [filled, setFilled] = useState<boolean[]>(() => courts.map(() => reduced));

  useEffect(() => {
    if (reduced) {
      setPhase('finale');
      setFilled(courts.map(() => true));
      return;
    }
    const timers: number[] = [];
    const t = (fn: () => void, ms: number) => timers.push(window.setTimeout(fn, ms));
    setPhase('lock');
    setIdx(0);
    setSub({ label: false, a: false, b: false, vs: false });
    setFilled(courts.map(() => false));

    // court i starts at 1700 + i*2350; sub-beats: label 0, a 350, b 700, vs 1050, fill 1500
    t(() => setPhase('court'), 1700);
    courts.forEach((_, i) => {
      const base = 1700 + i * 2350;
      t(() => {
        setIdx(i);
        setSub({ label: false, a: false, b: false, vs: false });
      }, base);
      t(() => setSub((s) => ({ ...s, label: true })), base + 30);
      t(() => setSub((s) => ({ ...s, a: true })), base + 350);
      t(() => setSub((s) => ({ ...s, b: true })), base + 700);
      t(() => setSub((s) => ({ ...s, vs: true })), base + 1050);
      t(() => setFilled((prev) => prev.map((v, j) => (j === i ? true : v))), base + 1500);
    });
    t(() => setPhase('finale'), 1700 + courts.length * 2350);
    return () => timers.forEach((id) => window.clearTimeout(id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, reduced, courts.length]);

  const court = courts[idx] ?? courts[0];
  const footline =
    idx === 0
      ? 'First up… who did the tokens put together?'
      : idx === courts.length - 1
        ? 'Last court of the round.'
        : 'Next court. The pairings keep coming.';

  return (
    <>
      {/* LOCK */}
      <div
        className="absolute inset-0 flex flex-col items-center justify-center"
        style={{ display: phase === 'lock' ? 'flex' : 'none' }}
      >
        <span style={{ color: 'var(--amber)', opacity: 0.9 }} aria-hidden>
          <svg width="72" height="72" viewBox="0 0 24 24" fill="none">
            <rect x="5" y="10.5" width="14" height="10.5" rx="2.2" stroke="currentColor" strokeWidth="1.5" />
            <path d="M8 10.5V8a4 4 0 018 0v2.5" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </span>
        <div className="serif mt-1 text-center text-[104px] leading-[.95]" style={{ color: 'var(--text)' }}>
          Ballots locked.
          <br />
          <em className="serif-i" style={{ color: 'var(--accent)' }}>
            Let&apos;s draw.
          </em>
        </div>
        <div className="mono mt-4 text-[22px] uppercase tracking-[.12em]" style={{ color: 'var(--text3)' }}>
          {tokensCast} tokens cast · {teamsToDraw} teams to reveal
        </div>
      </div>

      {/* COURT SPOTLIGHT */}
      <div
        className="absolute inset-0 flex-col items-center justify-center"
        style={{ display: phase === 'court' ? 'flex' : 'none' }}
      >
        <div
          className="mono text-center text-[18px] uppercase tracking-[.32em] transition-all duration-500"
          style={{ color: 'var(--accent)', opacity: sub.label ? 1 : 0, transform: sub.label ? 'none' : 'translateY(10px)' }}
        >
          Court {court.courtNo} of {courts.length}
        </div>
        <div className="mt-10 flex w-[1500px] items-center justify-center gap-[60px]">
          <StageSide team={court.teamA} shown={sub.a} side="left" />
          <div
            className="disp flex-shrink-0 text-[46px] font-black transition-all duration-300"
            style={{ color: sub.vs ? 'var(--text2)' : 'var(--text3)', opacity: sub.vs ? 1 : 0, transform: sub.vs ? 'scale(1)' : 'scale(.4)' }}
          >
            VS
          </div>
          <StageSide team={court.teamB} shown={sub.b} side="right" />
        </div>
      </div>

      {/* FINALE */}
      <div
        className="absolute inset-0 flex-col items-center justify-center"
        style={{ display: phase === 'finale' ? 'flex' : 'none' }}
      >
        <div className="mono text-[20px] uppercase tracking-[.32em]" style={{ color: 'var(--accent)' }}>
          Round {roundNo} pairings
        </div>
        <div className="serif mt-3.5 text-center text-[88px] leading-[.95]" style={{ color: 'var(--text)' }}>
          Take your <em className="serif-i" style={{ color: 'var(--accent)' }}>courts.</em>
        </div>
      </div>

      {/* summary rail */}
      <div className="absolute bottom-[92px] left-0 right-0 z-[9] flex justify-center gap-5 px-14">
        {courts.map((c, i) => {
          const active = phase === 'court' && i === idx;
          return (
            <div
              key={c.courtNo}
              className="max-w-[400px] flex-1 rounded-[18px] px-[18px] py-4 transition-all duration-500"
              style={{
                background: 'oklch(0.2 0.028 264)',
                border: active ? '1px solid oklch(0.55 0.13 140)' : '1px solid var(--line)',
                opacity: filled[i] || active ? 1 : 0.32,
                transform: active ? 'translateY(-6px)' : 'none',
                boxShadow: active ? '0 20px 50px -26px rgba(150,215,95,.4)' : undefined,
              }}
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="mono text-[11px] uppercase tracking-[.12em]" style={{ color: 'var(--text3)' }}>
                  Court {c.courtNo}
                </span>
                {filled[i] ? (
                  <span className="disp text-[15px] font-extrabold" style={{ color: 'var(--accent)' }}>
                    Set
                  </span>
                ) : null}
              </div>
              {filled[i] ? (
                <>
                  <MiniRow team={c.teamA} />
                  <div className="mono ml-0.5 text-[10px] tracking-[.14em]" style={{ color: 'var(--text3)' }}>
                    VS
                  </div>
                  <MiniRow team={c.teamB} />
                </>
              ) : (
                <div className="mono py-3.5 text-center text-[22px] tracking-[.3em]" style={{ color: 'var(--text3)', opacity: 0.5 }}>
                  · · ·
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* footline */}
      <div className="absolute bottom-[30px] left-0 right-0 z-10 text-center text-[18px]" style={{ color: 'var(--text3)' }}>
        {phase === 'lock' ? (
          <b style={{ color: 'var(--text2)', fontWeight: 500 }}>The room holds its breath…</b>
        ) : phase === 'finale' ? (
          <>
            <b style={{ color: 'var(--text2)', fontWeight: 500 }}>Head to your court.</b> Round starts when every team checks
            in.
          </>
        ) : (
          <b style={{ color: 'var(--text2)', fontWeight: 500 }}>{footline}</b>
        )}
      </div>
    </>
  );
}

function StageSide({ team, shown, side }: { team: RevealPlayer[]; shown: boolean; side: 'left' | 'right' }) {
  const combo = combined(team);
  const shift = side === 'left' ? -90 : 90;
  return (
    <div
      className="flex flex-1 flex-col items-center text-center transition-all duration-[600ms]"
      style={{ opacity: shown ? 1 : 0, transform: shown ? 'none' : `translateX(${shift}px)` }}
    >
      <div className="mb-5 flex">
        {team.map((p, i) => (
          <span key={p.id} style={{ marginLeft: i === 1 ? -34 : 0 }}>
            <Face name={p.name} size={128} />
          </span>
        ))}
      </div>
      <div
        className={`serif text-[72px] leading-none ${side === 'right' ? 'serif-i' : ''}`}
        style={{ color: side === 'right' ? 'var(--accent)' : 'var(--text)' }}
      >
        {teamName(team)}
      </div>
      <div className="mono mt-3 text-[15px] tracking-[.04em]" style={{ color: 'var(--text3)' }}>
        {combo ? `${combo} combined DUPR` : 'Drawn by the tokens'}
      </div>
    </div>
  );
}

function MiniRow({ team }: { team: RevealPlayer[] }) {
  return (
    <div className="flex items-center gap-2.5 py-1.5">
      <div className="flex">
        {team.map((p, i) => (
          <span key={p.id} style={{ marginLeft: i === 1 ? -10 : 0 }}>
            <Face name={p.name} size={34} />
          </span>
        ))}
      </div>
      <span className="text-[16px] font-semibold" style={{ color: 'var(--text)' }}>
        {teamName(team)}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exported stage: surface + fit-scale + chrome + variant switch.
// ---------------------------------------------------------------------------
export function MixerReveal({
  tournamentId,
  variant,
  eventName,
  roundNo,
  courts,
  pool,
  tokensCast,
  playersIn,
  teamsToDraw,
}: {
  tournamentId: string;
  variant: 'board' | 'stage';
  eventName: string;
  roundNo: number;
  courts: RevealCourt[];
  pool: string[];
  tokensCast: number;
  playersIn: number;
  teamsToDraw: number;
}) {
  const stageRef = useFitScale();
  const reduced = useReducedMotion();
  const [runId, setRunId] = useState(0);

  // Confetti fires with the reveal/finale. Track a coarse "done" flag on the
  // same timeline the inner stage uses, reset on replay.
  const [celebrate, setCelebrate] = useState(reduced);
  useEffect(() => {
    if (reduced) {
      setCelebrate(true);
      return;
    }
    setCelebrate(false);
    const at =
      variant === 'board'
        ? 2100 + 1500 + Math.max(0, courts.length - 1) * 900 + 700
        : 1700 + courts.length * 2350;
    const id = window.setTimeout(() => setCelebrate(true), at);
    return () => window.clearTimeout(id);
  }, [runId, reduced, variant, courts.length]);

  const isStage = variant === 'stage';

  return (
    <div className="theme-show" data-fullscreen="show">
      {/* eslint-disable-next-line react/no-danger */}
      <style dangerouslySetInnerHTML={{ __html: KEYFRAMES }} />
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <MixerRealtimeSync tournamentId={tournamentId} />
      {/* Chrome lives OUTSIDE the JS-scaled 1920×1080 stage: absolute inside a
          transformed ancestor would scale off-screen on laptop viewports,
          which made the Exit button unreachable. */}
      <Controls tournamentId={tournamentId} variant={variant} onReplay={() => setRunId((x) => x + 1)} />
      <div className="fixed inset-0 grid place-items-center overflow-hidden" style={{ background: isStage ? '#04050a' : '#06070c' }}>
        <div
          ref={stageRef}
          id="main"
          className="relative h-[1080px] w-[1920px] origin-center overflow-hidden"
          style={{
            background: isStage
              ? `radial-gradient(ellipse 60% 55% at 50% 42%, oklch(0.2 0.03 264 / .82), oklch(0.13 0.02 264 / .92) 70%, oklch(0.06 0.03 264 / .96) 100%), url('${GALAXY_BG}') center/cover no-repeat, #06070d`
              : `radial-gradient(ellipse 90% 60% at 50% -8%, color-mix(in oklch, var(--accent) 14%, transparent), transparent 60%), radial-gradient(ellipse 70% 50% at 50% 118%, color-mix(in oklch, var(--sky) 10%, transparent), transparent 55%), linear-gradient(180deg, oklch(0.11 0.05 270 / .8), oklch(0.09 0.05 265 / .9)), url('${GALAXY_BG}') center/cover no-repeat, var(--bg)`,
            color: 'var(--text)',
          }}
        >
          {/* backdrop texture */}
          {isStage ? (
            <>
              <div
                className="pointer-events-none absolute left-1/2 top-[-40%] h-[1500px] w-[1200px] -translate-x-1/2"
                style={{
                  background: 'radial-gradient(ellipse 40% 50% at 50% 30%, color-mix(in oklch, var(--accent) 15%, transparent), transparent 62%)',
                  animation: reduced ? undefined : 'ttdSweep 7s ease-in-out infinite',
                }}
                aria-hidden
              />
              <div className="pointer-events-none absolute inset-0 z-[8]" style={{ boxShadow: 'inset 0 0 320px 80px rgba(0,0,0,.7)' }} aria-hidden />
            </>
          ) : (
            <div className="pointer-events-none absolute inset-0 opacity-50" aria-hidden>
              <div className="absolute left-[8%] right-[8%] top-[22%] h-px" style={{ background: 'color-mix(in oklch, var(--line-2) 60%, transparent)' }} />
              <div className="absolute bottom-[22%] left-[8%] right-[8%] h-px" style={{ background: 'color-mix(in oklch, var(--line-2) 60%, transparent)' }} />
              <div className="absolute bottom-[22%] left-1/2 top-[22%] border-l-2 border-dashed" style={{ borderColor: 'color-mix(in oklch, var(--accent) 40%, transparent)' }} />
            </div>
          )}

          <TopBar eventName={eventName} roundNo={roundNo} />

          <div className="absolute inset-x-0 bottom-[210px] top-24 z-[5]">
            {isStage ? (
              <CenterStage
                key={`stage-${runId}`}
                courts={courts}
                roundNo={roundNo}
                tokensCast={tokensCast}
                teamsToDraw={teamsToDraw}
                runId={runId}
                reduced={reduced}
              />
            ) : (
              <BigBoard
                key={`board-${runId}`}
                courts={courts}
                pool={pool}
                roundNo={roundNo}
                tokensCast={tokensCast}
                playersIn={playersIn}
                teamsToDraw={teamsToDraw}
                runId={runId}
                reduced={reduced}
              />
            )}
          </div>

          {/* mascot */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={celebrate ? '/design-handoff/dink/sparkler.png' : '/design-handoff/dink/liberty.png'}
            alt=""
            className={`absolute z-[7] object-contain ${isStage ? 'bottom-[300px] left-[60px] w-[150px]' : 'bottom-24 right-[60px] w-[190px]'} ${reduced ? '' : 'animate-floatY'}`}
            style={{ filter: 'drop-shadow(0 18px 34px rgba(0,0,0,.6))' }}
          />

          {/* Big Board footer strip */}
          {!isStage && (
            <div
              className="absolute inset-x-0 bottom-0 z-[6] flex h-24 items-center justify-center border-t text-[20px]"
              style={{ borderColor: 'var(--line)', background: 'color-mix(in oklch, var(--bg) 70%, transparent)', backdropFilter: 'blur(8px)', color: 'var(--text2)' }}
            >
              {celebrate ? (
                <>
                  <b style={{ color: 'var(--text)', fontWeight: 600 }}>Head to your court.</b>&nbsp;Round starts when all teams
                  check in.
                </>
              ) : (
                <>
                  <b style={{ color: 'var(--text)', fontWeight: 600 }}>Shuffling the ballots…</b>&nbsp;the tokens are choosing
                  teams.
                </>
              )}
            </div>
          )}

          <Confetti fire={celebrate} count={isStage ? 80 : 70} />
        </div>
      </div>
    </div>
  );
}
