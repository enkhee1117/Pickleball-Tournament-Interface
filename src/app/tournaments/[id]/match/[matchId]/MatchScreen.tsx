'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { Avatar, playerFromName } from '@/components/ui/Avatar';
import { IconBtn } from '@/components/ui/IconBtn';
import { BigButton } from '@/components/ui/BigButton';
import { Icons } from '@/components/ui/icons';
import { claimMatchPlayer, saveMatchScore, setMatchRecording } from './actions';

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
  // Whether this user is allowed to record a score for this match. Drives
  // the keypad / End button visibility so spectators don't see UI that
  // silently fails on submit.
  canScore?: boolean;
  recordingUrl?: string | null;
};

// Keypad layout: digits left-aligned, op column on the right. The two
// arrows let the user jump between the team A and team B score fields
// without taking their hand off the keypad — typical flow is "type,
// arrow-down, type, End". Pickleball scores never need three digits, so
// pushing a second digit auto-advances to the other team automatically.
const KEYPAD: Array<string> = ['1', '2', '3', '↑', '4', '5', '6', '↓', '7', '8', '9', '⌫', 'C', '0', '', '▶'];
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
  canScore = false,
  recordingUrl = null,
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
  const confettiTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cancel any in-flight confetti timeout when the component unmounts so a
  // navigation away doesn't try to setState on a dead component.
  useEffect(() => {
    return () => {
      if (confettiTimer.current) clearTimeout(confettiTimer.current);
    };
  }, []);

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
    if (key === '↑') {
      setActive('A');
      return;
    }
    if (key === '↓') {
      setActive('B');
      return;
    }
    const cur = active === 'A' ? scoreA : scoreB;
    const setS = active === 'A' ? setScoreA : setScoreB;
    if (key === 'C') {
      setS(0);
      return;
    }
    if (key === '⌫') {
      setS(Math.floor(cur / 10));
      return;
    }
    if (/^[0-9]$/.test(key)) {
      // If the field already has two digits, treat the next digit as the
      // start of the OTHER team's score — no three-digit pickleball scores
      // and we want the user's typing to flow naturally.
      if (cur >= 10) {
        const other = active === 'A' ? 'B' : 'A';
        setActive(other);
        if (other === 'A') setScoreA(Number(key));
        else setScoreB(Number(key));
        return;
      }
      const next = cur === 0 ? Number(key) : cur * 10 + Number(key);
      setS(Math.min(99, next));
      // Two-digit score reached → auto-advance focus so the user can keep
      // typing without finding the down arrow.
      if (next >= 10) {
        setActive(active === 'A' ? 'B' : 'A');
      }
    }
  };

  const [saveError, setSaveError] = useState<string | null>(null);

  const finish = () => {
    if (!canScore) {
      setSaveError('Only the organizer (or a player in this match) can record a score.');
      return;
    }
    setSaveError(null);
    setDone(true);
    setJustFinished(true);
    setConfetti(true);
    if (confettiTimer.current) clearTimeout(confettiTimer.current);
    confettiTimer.current = setTimeout(() => setConfetti(false), 3000);
    startTransition(async () => {
      const res = await saveMatchScore({ matchId, scoreA, scoreB });
      if (!res.ok) {
        setSaveError(res.error ?? 'Could not save the score.');
        setDone(false);
        setJustFinished(false);
        setConfetti(false);
      }
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
        tournamentId={tournamentId}
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

      {!done && !canScore ? (
        <div className="bg-paper px-[18px] pt-3.5 pb-6">
          <div
            className="rounded-2xl p-4 text-center"
            style={{ background: '#fff', border: '1px dashed var(--line)' }}
          >
            <div className="text-[13px] font-semibold text-ink">View only</div>
            <div className="mt-1 text-[12px] text-ink-3">
              Only the organizer or a player in this match can record the score.
            </div>
          </div>
        </div>
      ) : !done ? (
        <div className="bg-paper px-3.5 pt-2.5 pb-4">
          {saveError && (
            <div
              className="mb-2 rounded-xl border px-3 py-2 text-[12px]"
              style={{ borderColor: 'var(--berry)', color: 'var(--berry)', background: 'oklch(0.96 0.04 12)' }}
            >
              {saveError}
            </div>
          )}
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
              const isOp = ['↑', '↓', '⌫', 'C'].includes(k);
              const isArrow = k === '↑' || k === '↓';
              const arrowActive = (k === '↑' && active === 'A') || (k === '↓' && active === 'B');
              return (
                <button
                  key={i}
                  onClick={() => press(k)}
                  aria-label={k === '↑' ? 'Focus team A' : k === '↓' ? 'Focus team B' : undefined}
                  className="h-14 rounded-2xl transition active:scale-95"
                  style={{
                    background: isArrow && arrowActive
                      ? 'var(--ink)'
                      : isOp
                        ? 'var(--paper-2)'
                        : '#fff',
                    color: isArrow && arrowActive ? 'var(--paper)' : 'var(--ink)',
                    border: '1px solid var(--line)',
                    fontFamily: isOp ? 'inherit' : 'var(--font-jetbrains-mono), JetBrains Mono, monospace',
                    fontSize: isArrow ? 20 : isOp ? 14 : 22,
                    fontWeight: 600,
                  }}
                >
                  {k}
                </button>
              );
            })}
          </div>
          <div className="mt-2 text-center text-[11px] text-ink-3">
            Swipe ← → for prev / next match · ↑ ↓ to switch team · two-digit
            score auto-advances
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

          <RecordingPanel
            matchId={matchId}
            initialUrl={recordingUrl}
            canEdit={canScore}
          />
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

function RecordingPanel({
  matchId,
  initialUrl,
  canEdit,
}: {
  matchId: string;
  initialUrl: string | null;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(initialUrl == null && canEdit);
  const [url, setUrl] = useState(initialUrl ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Hide entirely for spectators when no recording exists yet.
  if (!canEdit && !initialUrl) return null;

  const isYouTube = (href: string) => /(?:youtube\.com|youtu\.be)/i.test(href);

  const onSave = async (next: string) => {
    setPending(true);
    setError(null);
    const res = await setMatchRecording({ matchId, url: next });
    setPending(false);
    if (!res.ok) {
      setError(res.error ?? 'Could not save the link.');
      return;
    }
    setEditing(false);
    router.refresh();
  };

  if (initialUrl && !editing) {
    return (
      <div
        className="mb-3 flex items-center gap-3 rounded-2xl bg-white p-3"
        style={{ border: '1px solid var(--line)' }}
      >
        <a
          href={initialUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-1 items-center gap-2 truncate"
        >
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white"
            style={{ background: isYouTube(initialUrl) ? '#FF0033' : 'var(--ink)' }}
          >
            ▶
          </span>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-ink">
              {isYouTube(initialUrl) ? 'Watch on YouTube' : 'Watch recording'}
            </div>
            <div className="truncate text-[11px] text-ink-3">{initialUrl}</div>
          </div>
        </a>
        {canEdit && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-[11px] font-semibold text-ink-3 underline"
          >
            Edit
          </button>
        )}
      </div>
    );
  }

  if (!canEdit) return null;

  return (
    <div
      className="mb-3 rounded-2xl bg-white p-3"
      style={{ border: '1px solid var(--line)' }}
    >
      <div className="text-[11px] uppercase tracking-[0.06em] text-ink-3">
        Match recording
      </div>
      <div className="mt-0.5 text-[12px] text-ink-2">
        Paste a YouTube (or any) link so spectators can watch the replay.
      </div>
      <input
        type="url"
        inputMode="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://youtu.be/…"
        className="mt-2 w-full rounded-xl bg-white px-3 py-2 text-sm text-ink outline-none"
        style={{ border: '1px solid var(--line)' }}
      />
      {error && (
        <div className="mt-1.5 text-[11px]" style={{ color: 'var(--berry)' }}>
          {error}
        </div>
      )}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => onSave(url)}
          disabled={pending}
          className="rounded-xl px-3 py-1.5 text-[12px] font-semibold disabled:opacity-50"
          style={{ background: 'var(--ink)', color: 'var(--paper)' }}
        >
          {pending ? 'Saving…' : 'Save link'}
        </button>
        {initialUrl && (
          <button
            type="button"
            onClick={() => onSave('')}
            disabled={pending}
            className="rounded-xl px-3 py-1.5 text-[12px] font-semibold disabled:opacity-50"
            style={{ color: 'var(--berry)', border: '1px solid var(--berry)' }}
          >
            Remove
          </button>
        )}
        {initialUrl && (
          <button
            type="button"
            onClick={() => {
              setUrl(initialUrl);
              setEditing(false);
            }}
            className="rounded-xl px-3 py-1.5 text-[12px] font-semibold text-ink-2"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

function ClaimBanner({
  teamALabel,
  teamBLabel,
  tournamentId,
  claimables,
}: {
  teamALabel: string;
  teamBLabel: string;
  tournamentId: string;
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
    const res = await claimMatchPlayer({ playerId: player.id, tournamentId });
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
