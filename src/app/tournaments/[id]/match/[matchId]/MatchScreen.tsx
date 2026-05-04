'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Avatar, playerFromName } from '@/components/ui/Avatar';
import { IconBtn } from '@/components/ui/IconBtn';
import { BigButton } from '@/components/ui/BigButton';
import { Icons } from '@/components/ui/icons';
import { saveMatchScore } from './actions';

type Props = {
  tournamentId: string;
  matchId: string;
  court: string;
  round: string;
  teamALabel: string;
  teamBLabel: string;
  initialScoreA: number;
  initialScoreB: number;
};

const KEYPAD: Array<string> = ['1', '2', '3', '+1', '4', '5', '6', '−1', '7', '8', '9', '⌫', 'C', '0', '', '▶'];

export function MatchScreen({
  tournamentId,
  matchId,
  court,
  round,
  teamALabel,
  teamBLabel,
  initialScoreA,
  initialScoreB,
}: Props) {
  const router = useRouter();
  const [scoreA, setScoreA] = useState(initialScoreA);
  const [scoreB, setScoreB] = useState(initialScoreB);
  const [active, setActive] = useState<'A' | 'B'>('A');
  const [serving, setServing] = useState<'A' | 'B'>('A');
  const [done, setDone] = useState(false);
  const [confetti, setConfetti] = useState(false);
  const [isPending, startTransition] = useTransition();

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
    setConfetti(true);
    setTimeout(() => setConfetti(false), 3000);
    startTransition(async () => {
      await saveMatchScore({ matchId, scoreA, scoreB });
    });
  };

  const winner: 'A' | 'B' = scoreA > scoreB ? 'A' : 'B';
  const canEnd = scoreA >= 11 || scoreB >= 11;

  return (
    <div className="flex min-h-full flex-col bg-paper">
      <div className="flex items-center justify-between px-[18px] pt-2 pb-2.5">
        <IconBtn aria-label="Back" onClick={() => router.push(`/tournaments/${tournamentId}`)}>
          {Icons.back}
        </IconBtn>
        <div className="text-center">
          <div className="text-[11px] tracking-[0.06em] text-ink-3">
            {court.toUpperCase()} · {round.toUpperCase()}
          </div>
          <div className="mt-0.5 text-[13px] font-semibold text-ink">Game to 11, win by 2</div>
        </div>
        <IconBtn aria-label="More">{Icons.more}</IconBtn>
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
            Tap a team panel to switch input · long-press to set serve
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
                WINNER
              </div>
              <div className="serif text-[22px] leading-[1.1] text-ink">
                {(winner === 'A' ? teamAPlayers : teamBPlayers).map((p) => p?.name?.split(' ')[0]).join(' & ')}
              </div>
              <div className="mt-0.5 text-xs" style={{ color: 'oklch(0.3 0.05 140)' }}>
                {Math.max(scoreA, scoreB)}–{Math.min(scoreA, scoreB)}
                {isPending ? ' · Saving…' : ' · Saved'}
              </div>
            </div>
          </div>
          <BigButton tone="ink" onClick={() => router.push(`/tournaments/${tournamentId}`)}>
            Back to scoreboard
          </BigButton>
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
  return parts.slice(0, 2).map(playerFromName);
}
