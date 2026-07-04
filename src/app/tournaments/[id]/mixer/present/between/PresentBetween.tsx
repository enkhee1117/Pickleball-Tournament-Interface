'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { GALAXY_BG } from '@/lib/demo-roster';
import { BallMark } from '@/components/desktop/BallMark';
import { MixerRealtimeSync } from '../../MixerRealtimeSync';

interface StandingItem {
  rank: number;
  playerId: string;
  name: string;
  wins: number;
  losses: number;
  points: number;
  pointDiff: number;
}

const firstName = (n: string) => n.split(' ')[0];
const initials = (n: string) =>
  n.split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

function Face({ name, size, ring }: { name: string; size: number; ring?: boolean }) {
  return (
    <span
      className={`av${ring ? ' ring' : ''}`}
      style={{ width: size, height: size, fontSize: size * 0.34, color: 'var(--court-deep)', background: 'var(--surface-raise)' }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

export function PresentBetween({
  tournamentId,
  tournamentName,
  roundsTotal,
  scoredRound,
  nextRoundNo,
  lockAt,
  standings,
  deltas,
  facewall,
}: {
  tournamentId: string;
  tournamentName: string;
  roundsTotal: number;
  scoredRound: number;
  nextRoundNo: number | null;
  lockAt: string | null;
  standings: StandingItem[];
  deltas: Record<string, number>;
  facewall: { id: string; name: string; checked: boolean }[];
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<'standings' | 'holding'>('standings');

  // Fit the fixed 1920×1080 stage into the viewport.
  useEffect(() => {
    function fit() {
      const el = stageRef.current;
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

  // Auto-cycle standings ⇄ holding every 7s.
  useEffect(() => {
    const timer = window.setInterval(() => setPhase((p) => (p === 'standings' ? 'holding' : 'standings')), 7000);
    return () => window.clearInterval(timer);
  }, []);

  // Countdown to the next round: from lock_at when it is in the future,
  // otherwise a gentle 90s holding timer.
  const [seconds, setSeconds] = useState(90);
  useEffect(() => {
    if (lockAt) {
      const diff = Math.floor((new Date(lockAt).getTime() - Date.now()) / 1000);
      if (Number.isFinite(diff) && diff > 0) setSeconds(Math.min(diff, 3600));
    }
  }, [lockAt]);
  useEffect(() => {
    if (phase !== 'holding') return;
    const timer = window.setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [phase]);

  const leader = standings[0] ?? null;
  const board = standings.slice(1);
  const checkedCount = facewall.filter((f) => f.checked).length;
  const total = facewall.length;
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');

  return (
    <div className="theme-show" data-fullscreen="show">
      <a href="#main" className="skip-link">Skip to content</a>
      <MixerRealtimeSync tournamentId={tournamentId} />
      {/* Viewport-pinned chrome — inside the scaled stage these would drift
          off-screen on laptop viewports. */}
      <Link
        href={`/tournaments/${tournamentId}`}
        className="mono fixed bottom-5 left-5 z-30 rounded-full px-[15px] py-[9px] text-[12px] uppercase tracking-[.1em]"
        style={{ background: 'var(--show-chip)', border: '1px solid var(--line-2)', color: 'var(--text3)' }}
      >
        ← Exit
      </Link>
      <button
        type="button"
        onClick={() => setPhase((p) => (p === 'standings' ? 'holding' : 'standings'))}
        className="mono fixed bottom-5 right-5 z-30 rounded-full px-[15px] py-[9px] text-[12px] uppercase tracking-[.1em]"
        style={{ background: 'var(--show-chip)', border: '1px solid var(--line-2)', color: 'var(--text2)' }}
      >
        ↻ Cycle view
      </button>
      <div className="fixed inset-0 grid place-items-center overflow-hidden" style={{ background: 'var(--show-bg)' }}>
        <div
          ref={stageRef}
          id="main"
          className="relative h-[1080px] w-[1920px] origin-center overflow-hidden"
          style={{
            background: `var(--show-galaxy-veil), url('${GALAXY_BG}') center/cover no-repeat, var(--bg)`,
            color: 'var(--text)',
          }}
        >
          {/* top bar */}
          <div className="absolute left-0 right-0 top-0 z-[6] flex h-24 items-center justify-between px-14">
            <div className="flex items-center gap-3" style={{ color: 'var(--text)' }}>
              <BallMark size={38} />
              <span className="serif text-[30px]">Try to Dink</span>
            </div>
            <div className="flex items-center gap-3.5">
              <span
                className="mono rounded-full px-[11px] py-[5px] text-[10.5px] font-bold text-white"
                style={{ background: 'var(--liberty-banner)' }}
              >
                ★ 250
              </span>
              <span className="chip chip-live"><span className="dot" />Between rounds</span>
              <span className="serif text-[24px]" style={{ color: 'var(--text2)' }}>{tournamentName}</span>
              <span className="chip">Round {scoredRound} complete</span>
            </div>
          </div>

          {/* phase tabs */}
          <div
            className="absolute left-1/2 top-[30px] z-[21] flex -translate-x-1/2 gap-1.5 rounded-full p-[5px]"
            style={{ background: 'var(--show-chip)', border: '1px solid var(--line-2)' }}
          >
            {(['standings', 'holding'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPhase(p)}
                className="mono rounded-full px-4 py-[7px] text-[12px] uppercase tracking-[.06em]"
                style={phase === p ? { background: 'var(--accent)', color: 'var(--accent-ink)', fontWeight: 700 } : { color: 'var(--text3)' }}
              >
                {p === 'standings' ? 'Standings' : 'Next round'}
              </button>
            ))}
          </div>

          {/* phases */}
          <div className="absolute inset-x-0 bottom-24 top-24 z-[5] flex flex-col items-center justify-center">
            {/* STANDINGS */}
            <div
              className="absolute inset-0 flex flex-col items-center justify-center px-[90px] transition-opacity duration-500"
              style={{ opacity: phase === 'standings' ? 1 : 0, pointerEvents: phase === 'standings' ? 'auto' : 'none' }}
            >
              {leader ? (
                <>
                  <div className="mb-7 text-center">
                    <div className="mono text-[14px] uppercase tracking-[.16em]" style={{ color: 'var(--accent)' }}>
                      After round {scoredRound} of {roundsTotal}
                    </div>
                    <div className="serif mt-2 text-[64px] leading-[.98]">
                      The board <em className="serif-i" style={{ color: 'var(--accent)' }}>right now.</em>
                    </div>
                  </div>
                  <LeaderCard leader={leader} />
                  <div className="grid w-[1500px] grid-cols-2 gap-x-11 gap-y-3">
                    {board.map((row, i) => (
                      <BoardRow key={row.playerId} row={row} delta={deltas[row.playerId] ?? 0} index={i} />
                    ))}
                  </div>
                </>
              ) : (
                <div className="text-center">
                  <div className="serif text-[64px] leading-none">No scores yet.</div>
                  <div className="mt-4 text-[20px]" style={{ color: 'var(--text2)' }}>
                    Post a court from score entry and the board fills in here.
                  </div>
                </div>
              )}
            </div>

            {/* HOLDING */}
            <div
              className="absolute inset-0 flex flex-col items-center justify-center px-[90px] transition-opacity duration-500"
              style={{ opacity: phase === 'holding' ? 1 : 0, pointerEvents: phase === 'holding' ? 'auto' : 'none' }}
            >
              <div className="text-center">
                <div className="mono text-[14px] uppercase tracking-[.16em]" style={{ color: 'var(--accent)' }}>
                  {nextRoundNo ? `Round ${nextRoundNo} locks in` : 'Holding'}
                </div>
                <div className="mono text-[200px] font-bold leading-[.9] tracking-[-.04em]">
                  {mm}:<span style={{ color: 'var(--accent)' }}>{ss}</span>
                </div>
                <div className="mono mt-2 text-[18px] uppercase tracking-[.18em]" style={{ color: 'var(--text3)' }}>
                  Grab water · check in on your phone
                </div>
              </div>
              <div className="mt-11 w-[900px]">
                <div className="h-5 overflow-hidden rounded-full" style={{ background: 'var(--show-track)', border: '1px solid var(--line-2)' }}>
                  <div
                    className="h-full rounded-full transition-[width] duration-1000"
                    style={{
                      width: `${total ? Math.round((checkedCount / total) * 100) : 0}%`,
                      background: 'linear-gradient(90deg, var(--court-deep), var(--accent))',
                      boxShadow: '0 0 24px color-mix(in oklch, var(--accent) 60%, transparent)',
                    }}
                  />
                </div>
                <div className="mono mt-3.5 flex justify-between text-[16px]" style={{ color: 'var(--text2)' }}>
                  <span><b style={{ color: 'var(--text)' }}>{checkedCount}</b> of {total} checked in</span>
                  <span>Draw runs automatically at zero</span>
                </div>
              </div>
              <div className="mt-9 flex max-w-[1100px] flex-wrap justify-center gap-3">
                {facewall.map((f) => (
                  <div
                    key={f.id}
                    className="flex items-center gap-2.5 rounded-full py-2.5 pl-2.5 pr-4 text-[17px] font-semibold"
                    style={{ background: 'color-mix(in oklch, var(--show-card-2) 70%, transparent)', border: '1px solid var(--line-2)', color: 'var(--text)', opacity: f.checked ? 1 : 0.42 }}
                  >
                    <Face name={f.name} size={34} />
                    {firstName(f.name)}
                    <span style={{ color: f.checked ? 'var(--accent)' : 'var(--text3)' }}>{f.checked ? '✓' : '…'}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* mascot + footer */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={phase === 'holding' ? '/design-handoff/dink/coach.png' : '/design-handoff/dink/happy-bust.png'}
            alt=""
            className="absolute bottom-10 right-14 z-[6] w-[170px] animate-floatY"
            style={{ filter: 'drop-shadow(0 20px 40px rgba(0,0,0,.5))' }}
          />
          <div
            className="absolute inset-x-0 bottom-0 z-[6] flex h-20 items-center justify-center gap-[22px] border-t"
            style={{ borderColor: 'var(--line)', background: 'color-mix(in oklch, var(--bg) 70%, transparent)', backdropFilter: 'blur(8px)' }}
          >
            <div className="text-[19px]" style={{ color: 'var(--text2)' }}>
              {phase === 'holding' ? (
                'The draw for the next round runs the second everyone checks in.'
              ) : (
                <><b style={{ color: 'var(--text)', fontWeight: 600 }}>Standings update live</b> as scores post from the courts.</>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

function LeaderCard({ leader }: { leader: StandingItem }) {
  return (
    <div
      className="mb-5 flex w-[1500px] items-center gap-[26px] rounded-[26px] px-[34px] py-[26px]"
      style={{
        background: 'linear-gradient(120deg, color-mix(in oklch, var(--accent) 26%, var(--show-tint)), var(--show-tint) 62%)',
        border: '1px solid color-mix(in oklch, var(--accent) 45%, var(--line-2))',
      }}
    >
      <span className="animate-floatY" style={{ color: 'var(--amber)' }}>
        <svg width="46" height="46" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M3 7l4.5 4L12 5l4.5 6L21 7l-1.6 11H4.6L3 7z" fill="currentColor" /></svg>
      </span>
      <span
        className="disp grid h-16 w-16 place-items-center rounded-[18px] text-[34px] font-black"
        style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
      >
        1
      </span>
      <Face name={leader.name} size={80} ring />
      <div>
        <div className="disp text-[44px] font-extrabold leading-none tracking-[-.01em]">{leader.name}</div>
        <div className="mono mt-2 text-[15px] tracking-[.02em]" style={{ color: 'var(--text2)' }}>
          {leader.wins}–{leader.losses} · leader of the night
        </div>
      </div>
      <div className="ml-auto text-right">
        <div className="mono text-[52px] font-bold leading-none tracking-[-.03em]" style={{ color: 'var(--accent)' }}>
          {leader.points}
        </div>
        <div className="mono mt-1.5 text-[12px] uppercase tracking-[.14em]" style={{ color: 'var(--text3)' }}>Points</div>
      </div>
    </div>
  );
}

function BoardRow({ row, delta, index }: { row: StandingItem; delta: number; index: number }) {
  return (
    <div
      className="grid grid-cols-[52px_64px_1fr_auto_auto] items-center gap-5 rounded-2xl px-[22px] py-3.5"
      style={{ background: 'color-mix(in oklch, var(--show-card-2) 72%, transparent)', border: '1px solid var(--line-2)', animation: `climb .7s cubic-bezier(.2,1.2,.4,1) both`, animationDelay: `${index * 55}ms` }}
    >
      <span className="disp text-center text-[30px] font-extrabold" style={{ color: 'var(--text3)' }}>{row.rank}</span>
      <Face name={row.name} size={52} />
      <span className="disp text-[26px] font-bold" style={{ color: 'var(--text)' }}>
        {firstName(row.name)}
        {delta > 0 ? (
          <span className="mono ml-1.5 rounded-md px-[7px] py-[2px] text-[13px] font-bold" style={{ color: 'var(--accent)', background: 'color-mix(in oklch, var(--accent) 18%, transparent)' }}>
            ▲{delta}
          </span>
        ) : null}
      </span>
      <span className="mono text-[20px]" style={{ color: 'var(--text2)' }}>{row.wins}–{row.losses}</span>
      <span className="mono min-w-16 text-right text-[24px] font-bold tracking-[-.02em]" style={{ color: 'var(--accent)' }}>{row.points}</span>
    </div>
  );
}
