'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { Avatar, playerFromName } from '@/components/ui/Avatar';
import { IconBtn } from '@/components/ui/IconBtn';
import { BigButton } from '@/components/ui/BigButton';
import { Icons } from '@/components/ui/icons';
import { claimMatchPlayer, saveMatchScore } from './actions';

type Claimable = { id: string; displayName: string };

type Props = {
  tournamentId: string;
  matchId: string;
  court: string;
  round: string;
  teamALabel: string;
  teamBLabel: string;
  initialScoreA: number;
  initialScoreB: number;
  initialDone?: boolean;
  returnTab?: 'matches' | 'bracket';
  prevMatchId?: string | null;
  nextMatchId?: string | null;
  nextUnscoredMatchId?: string | null;
  position?: number;
  total?: number;
  // Unclaimed roster rows whose display_name appears in this match's team
  // labels — null when the user is signed out, or has already claimed a
  // slot in this tournament.
  claimables?: Claimable[] | null;
};

const KEYPAD: Array<string> = ['1', '2', '3', '+1', '4', '5', '6', '−1', '7', '8', '9', '⌫', 'C', '0', '', '▶'];
const SWIPE_MIN_PX = 60;
const SWIPE_MAX_VERTICAL_RATIO = 0.6;

export function MatchScreen({
  tournamentId,
  matchId,
  court,
  round,
  teamALabel,
  teamBLabel,
  initialScoreA,
  initialScoreB,
  initialDone = false,
  returnTab = 'matches',
  prevMatchId = null,
  nextMatchId = null,
  nextUnscoredMatchId = null,
  position = 0,
  total = 0,
  claimables = null,
}: Props) {
  const router = useRouter();
  const returnHref = `/tournaments/${tournamentId}?tab=${returnTab}`;
  const matchHref = (id: string) => `/tournaments/${tournamentId}/match/${id}`;
  const [scoreA, setScoreA] = useState(initialScoreA);
  const [scoreB, setScoreB] = useState(initialScoreB);
  const [active, setActive] = useState<'A' | 'B'>('A');
  const [serving, setServing] = useState<'A' | 'B'>('A');
  // The match is "done" if it landed here already finished (don't rerun the
  // confetti) or the user just hit End. Server-finished matches stay locked
  // behind a Re-open button so a stray tap doesn't blow away saved scores.
  const [done, setDone] = useState(initialDone);
  const [justFinished, setJustFinished] = useState(false);
  const [confetti, setConfetti] = useState(false);
  const [isPending, startTransition] = useTransition();
  const swipeStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    setScoreA(initialScoreA);
    setScoreB(initialScoreB);
    setActive('A');
    setServing('A');
    setDone(initialDone);
    setJustFinished(false);
    setConfetti(false);
  }, [matchId, initialScoreA, initialScoreB, initialDone]);

  const goPrev = () => {
    if (prevMatchId) router.push(matchHref(prevMatchId));
  };
  const goNext = () => {
    if (nextMatchId) router.push(matchHref(nextMatchId));
  };

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    swipeStart.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < SWIPE_MIN_PX) return;
    if (Math.abs(dy) > Math.abs(dx) * SWIPE_MAX_VERTICAL_RATIO) return;
    if (dx < 0) goNext();
    else goPrev();
  };

  const teamAPlayers = parseTeam(teamALabel);
  const teamBPlayers = parseTeam(teamBLabel);

  const press = (key: string) => {
    if (done) return;
    const cur = active === 'A' ? scoreA : scoreB;
    const setS = active === 'A' ? setScoreA : setScoreB;
    if (key === 'C') setS(0);
    else if (key === '⌫') setS(Math.floor(cur / 10));
    else if (key === '+1') setS(Math.min(99, cur + 1));
    else if (key === '−1') setS(Math.max(0, cur - 1));
    else if (/^[0-9]$/.test(key)) {
      const next = cur === 0 ? Number(key) : Math.min(99, cur * 10 + Number(key));
      setS(next);
    }
  };

  const finish = () => {
    setDone(true);
    setJustFinished(true);
    setConfetti(true);
    setTimeout(() => setConfetti(false), 3000);
    startTransition(async () => {
      await saveMatchScore({ matchId, scoreA, scoreB });
    });
  };

  const reopen = () => {
    setDone(false);
    setJustFinished(false);
  };

  const winner: 'A' | 'B' = scoreA > scoreB ? 'A' : 'B';
  const canEnd = scoreA >= 11 || scoreB >= 11;

  return (
    <div
      className="flex min-h-full flex-col bg-paper"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className="flex items-center justify-between px-[18px] pt-2 pb-2.5">
        <IconBtn aria-label="Back" onClick={() => router.push(returnHref)}>
          {Icons.back}
        </IconBtn>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goPrev}
            disabled={!prevMatchId}
            aria-label="Previous match"
            className="flex h-8 w-8 items-center justify-center rounded-lg disabled:opacity-30"
            style={{ color: 'var(--ink-2)', border: '1px solid var(--line)', background: '#fff' }}
          >
            {Icons.chevronLeft}
          </button>
          <div className="text-center">
            <div className="text-[11px] tracking-[0.06em] text-ink-3">
              {court.toUpperCase()} · {round.toUpperCase()}
            </div>
            <div className="mt-0.5 text-[12px] font-semibold text-ink">
              Game to 11, win by 2
              {total > 0 && (
                <span className="ml-1 text-ink-3">
                  · {position}/{total}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={goNext}
            disabled={!nextMatchId}
            aria-label="Next match"
            className="flex h-8 w-8 items-center justify-center rounded-lg disabled:opacity-30"
            style={{ color: 'var(--ink-2)', border: '1px solid var(--line)', background: '#fff' }}
          >
            {Icons.chevronRight}
          </button>
        </div>
        <div className="h-10 w-10" />
      </div>

      {confetti && (
        <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
          {Array.from({ length: 30 }).map((_, i) => {
            const colors = ['var(--court)', 'var(--serve)', 'var(--ink)', 'var(--berry)'];
            return (
              <div
                key={i}
                className="absolute bottom-0 h-3 w-2"
                style={{
                  background: colors[i % 4],
                  left: `${Math.random() * 100}%`,
                  animation: `confetti ${2 + Math.random() * 1.5}s ease-out forwards`,
                  animationDelay: `${Math.random() * 0.5}s`,
                  transform: `rotate(${Math.random() * 360}deg)`,
                }}
              />
            );
          })}
        </div>
      )}

      <ClaimBanner
        teamALabel={teamALabel}
        teamBLabel={teamBLabel}
        matchId={matchId}
        claimables={claimables}
      />

      <div className="flex flex-1 flex-col px-3.5 py-2">
        <ScorePanel
          label={teamAPlayers.map((p) => p?.name?.split(' ')[0]).join(' & ')}
          players={teamAPlayers}
          score={scoreA}
          serving={serving === 'A'}
          active={active === 'A'}
          win={done && winner === 'A'}
          onTap={() => setActive('A')}
          onServe={() => setServing('A')}
          color="var(--court)"
        />
        <div className="py-2 text-center text-[11px] font-semibold tracking-[0.1em] text-ink-3">VS</div>
        <ScorePanel
          label={teamBPlayers.map((p) => p?.name?.split(' ')[0]).join(' & ')}
          players={teamBPlayers}
          score={scoreB}
          serving={serving === 'B'}
          active={active === 'B'}
          win={done && winner === 'B'}
          onTap={() => setActive('B')}
          onServe={() => setServing('B')}
          color="var(--serve)"
        />
      </div>

      {!done ? (
        <div className="bg-paper px-3.5 pt-2.5 pb-4">
          <div className="grid grid-cols-4 gap-2">
            {KEYPAD.map((k, i) => {
              if (k === '') return <div key={i} />;
              if (k === '▶') {
                return (
                  <button
                    key={i}
                    onClick={finish}
                    disabled={!canEnd}
                    className="h-14 rounded-2xl text-base font-semibold transition active:scale-95 disabled:opacity-30"
                    style={{ background: 'var(--ink)', color: 'var(--paper)' }}
                  >
                    End ↵
                  </button>
                );
              }
              const isOp = ['+1', '−1', '⌫', 'C'].includes(k);
              return (
                <button
                  key={i}
                  onClick={() => press(k)}
                  className="h-14 rounded-2xl text-ink transition active:scale-95"
                  style={{
                    background: isOp ? 'var(--paper-2)' : '#fff',
                    border: '1px solid var(--line)',
                    fontFamily: isOp ? 'inherit' : 'var(--font-jetbrains-mono), JetBrains Mono, monospace',
                    fontSize: isOp ? 14 : 22,
                    fontWeight: 600,
                  }}
                >
                  {k}
                </button>
              );
            })}
          </div>
          <div className="mt-2 text-center text-[11px] text-ink-3">
            Swipe ← → for prev / next match · tap a team panel to switch input
          </div>
        </div>
      ) : (
        <div className="bg-paper px-[18px] pt-3.5 pb-[18px]">
          <div
            className="mb-3 flex items-center gap-3 rounded-2xl p-4"
            style={{ background: 'var(--court)' }}
          >
            <div className="text-[32px]">🏆</div>
            <div className="flex-1">
              <div
                className="text-[13px] font-semibold tracking-[0.04em]"
                style={{ color: 'oklch(0.3 0.05 140)' }}
              >
                {justFinished ? 'WINNER' : 'FINAL'}
              </div>
              <div className="serif text-[22px] leading-[1.1] text-ink">
                {(winner === 'A' ? teamAPlayers : teamBPlayers).map((p) => p?.name?.split(' ')[0]).join(' & ')}
              </div>
              <div className="mt-0.5 text-xs" style={{ color: 'oklch(0.3 0.05 140)' }}>
                {Math.max(scoreA, scoreB)}–{Math.min(scoreA, scoreB)}
                {justFinished ? (isPending ? ' · Saving…' : ' · Saved') : ' · Saved'}
              </div>
            </div>
          </div>
          {nextUnscoredMatchId ? (
            <BigButton
              tone="ink"
              onClick={() => router.push(matchHref(nextUnscoredMatchId))}
            >
              Score next match →
            </BigButton>
          ) : (
            <BigButton tone="ink" onClick={() => router.push(returnHref)}>
              Back to scoreboard
            </BigButton>
          )}
          <div className="mt-2 grid gap-2">
            {nextUnscoredMatchId && (
              <button
                type="button"
                onClick={() => router.push(returnHref)}
                className="w-full rounded-xl py-2.5 text-[12px] font-semibold text-ink-2"
              >
                Back to scoreboard
              </button>
            )}
            <button
              type="button"
              onClick={reopen}
              className="w-full rounded-xl py-2.5 text-[12px] font-semibold"
              style={{ color: 'var(--ink-3)' }}
            >
              Re-open match to edit score
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ScorePanel({
  label,
  players,
  score,
  serving,
  active,
  win,
  onTap,
  onServe,
  color,
}: {
  label: string;
  players: ReturnType<typeof parseTeam>;
  score: number;
  serving: boolean;
  active: boolean;
  win: boolean;
  onTap: () => void;
  onServe: () => void;
  color: string;
}) {
  return (
    <button
      onClick={onTap}
      className="relative flex min-h-[100px] flex-1 items-center gap-3 overflow-hidden rounded-2xl bg-white p-3.5 text-left transition"
      style={{
        background: win ? color : '#fff',
        border: active ? `2px solid ${color}` : '1.5px solid var(--line)',
      }}
    >
      {active && !win && (
        <div className="absolute inset-0 overflow-hidden rounded-2xl">
          <div
            className="absolute bottom-0 top-0 w-16 animate-shimmer"
            style={{ background: `linear-gradient(90deg, transparent, ${color}33, transparent)` }}
          />
        </div>
      )}
      <div className="relative z-10 flex flex-col gap-1">
        <div className="flex">
          <Avatar player={players[0]} size={36} />
          {players[1] && (
            <div className="-ml-2">
              <Avatar player={players[1]} size={36} />
            </div>
          )}
        </div>
        {serving && (
          <div
            onClick={(e) => {
              e.stopPropagation();
              onServe();
            }}
            className="inline-flex items-center gap-1 self-start rounded-full px-2 py-0.5 text-[9.5px] font-bold tracking-[0.08em]"
            style={{
              background: 'oklch(0.2 0.05 60 / 0.1)',
              color: win ? 'var(--ink)' : 'var(--ink-2)',
            }}
          >
            ● SERVE
          </div>
        )}
      </div>
      <div className="relative z-10 flex-1">
        <div className="text-[13px] font-semibold tracking-tight text-ink">{label || 'Team'}</div>
        <div
          className="mt-0.5 text-[11px]"
          style={{ color: win ? 'oklch(0.3 0.05 140)' : 'var(--ink-3)' }}
        >
          Tap to focus input
        </div>
      </div>
      <div
        key={score}
        className="mono relative z-10 animate-pop text-[56px] font-bold leading-none tracking-[-0.04em] text-ink"
      >
        {score}
      </div>
    </button>
  );
}

function parseTeam(label: string) {
  const parts = label.split(/\s*&\s*|\s*\/\s*/).filter(Boolean);
  return parts.slice(0, 2).map((s) => playerFromName(s));
}

function ClaimBanner({
  teamALabel,
  teamBLabel,
  matchId,
  claimables,
}: {
  teamALabel: string;
  teamBLabel: string;
  matchId: string;
  claimables: Claimable[] | null;
}) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  if (!claimables || claimables.length === 0) return null;

  const namesInThisMatch = new Set(
    [teamALabel, teamBLabel].flatMap((label) =>
      label.split(/\s*&\s*|\s*\/\s*/).map((s) => s.trim()),
    ),
  );
  const matches = claimables.filter((c) => namesInThisMatch.has(c.displayName));
  if (matches.length === 0) return null;

  const onClaim = async (player: Claimable) => {
    setPending(player.id);
    setError(null);
    const res = await claimMatchPlayer({ playerId: player.id, matchId });
    setPending(null);
    if (!res.ok) {
      setError(res.error ?? 'Could not claim that slot.');
      return;
    }
    router.refresh();
  };

  return (
    <div
      className="mx-3.5 mt-2 rounded-2xl px-3 py-2.5"
      style={{ background: 'var(--paper-2)', border: '1px solid var(--line)' }}
    >
      <div className="text-[11px] uppercase tracking-[0.06em] text-ink-3">
        Are you in this match?
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {matches.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onClaim(c)}
            disabled={pending !== null}
            className="rounded-full px-3 py-1.5 text-[12px] font-semibold disabled:opacity-50"
            style={{ background: 'var(--ink)', color: 'var(--paper)' }}
          >
            {pending === c.id ? 'Linking…' : `I'm ${c.displayName}`}
          </button>
        ))}
      </div>
      {error && (
        <div className="mt-1.5 text-[11px]" style={{ color: 'var(--berry)' }}>
          {error}
        </div>
      )}
    </div>
  );
}
