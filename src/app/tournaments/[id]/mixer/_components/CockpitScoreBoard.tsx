'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { gameSlotLabel, type CourtResult } from '@/lib/mixer-standings';
import { GamesProgressStrip } from '@/components/ui/GamesProgressStrip';
import { useToast } from '@/components/desktop';
import { ScoreCard, isValid, winValue } from './score-cards';
import { postCourtScore } from '../score/actions';

// The cockpit's Scores tab, rebuilt to the design handoff: the games-progress
// strip, round tabs with status dots, and the same live/final scorecards with
// inline steppers + one-tap win as the dedicated score surface. Posts optimist-
// ically through the shared postCourtScore action (game to 11, win by 2) and
// toasts the result — no standings sidebar here (that lives on /mixer/score).
type RoundStatus = 'final' | 'live' | 'up';

function sig(results: CourtResult[]): string {
  return results.map((r) => `${r.key}:${r.completed ? 1 : 0}:${r.scoreA}:${r.scoreB}`).join('|');
}

function seedDrafts(results: CourtResult[]): Record<string, { a: number; b: number }> {
  const d: Record<string, { a: number; b: number }> = {};
  for (const r of results) d[r.key] = { a: r.scoreA, b: r.scoreB };
  return d;
}

export function CockpitScoreBoard({
  tournamentId,
  roundNo,
  roundsTotal,
  results: initialResults,
}: {
  tournamentId: string;
  roundNo: number;
  roundsTotal: number;
  results: CourtResult[];
}) {
  const toast = useToast();
  const [, startTransition] = useTransition();

  const [results, setResults] = useState<CourtResult[]>(initialResults);
  const propSig = sig(initialResults);
  const lastPropSig = useRef(propSig);
  useEffect(() => {
    if (propSig !== lastPropSig.current) {
      lastPropSig.current = propSig;
      setResults(initialResults);
      setDrafts(seedDrafts(initialResults));
      setReopened(new Set());
    }
  }, [propSig, initialResults]);

  const [drafts, setDrafts] = useState<Record<string, { a: number; b: number }>>(() => seedDrafts(initialResults));
  const [reopened, setReopened] = useState<Set<string>>(new Set());

  const roundsMeta = useMemo(() => {
    const total = Math.max(roundsTotal, roundNo, ...results.map((r) => r.roundNo), 1);
    const list: { round: number; status: RoundStatus; drawn: boolean }[] = [];
    for (let r = 1; r <= total; r++) {
      const games = results.filter((x) => x.roundNo === r);
      let status: RoundStatus;
      if (games.length === 0) status = 'up';
      else if (games.some((g) => g.editable && !g.completed)) status = 'live';
      else if (games.every((g) => g.completed)) status = 'final';
      else status = 'up';
      list.push({ round: r, status, drawn: games.length > 0 });
    }
    return list;
  }, [results, roundsTotal, roundNo]);

  const liveRound = roundsMeta.find((r) => r.status === 'live')?.round;
  const [viewRound, setViewRound] = useState<number>(liveRound ?? roundNo ?? 1);
  const viewMetaRef = useRef(liveRound);
  useEffect(() => {
    if (liveRound && liveRound !== viewMetaRef.current) {
      viewMetaRef.current = liveRound;
      setViewRound(liveRound);
    }
  }, [liveRound]);

  const viewCourts = useMemo(
    () => results.filter((r) => r.roundNo === viewRound).sort((a, b) => a.courtNo - b.courtNo || a.waveNo - b.waveNo),
    [results, viewRound],
  );

  function setDraft(key: string, side: 'a' | 'b', value: number) {
    setDrafts((d) => ({ ...d, [key]: { ...(d[key] ?? { a: 0, b: 0 }), [side]: Math.max(0, Math.min(30, value)) } }));
  }
  function quick11(court: CourtResult, side: 'a' | 'b') {
    const cur = drafts[court.key] ?? { a: 0, b: 0 };
    setDraft(court.key, side, winValue(side === 'a' ? cur.b : cur.a));
  }

  function post(court: CourtResult) {
    const draft = drafts[court.key] ?? { a: 0, b: 0 };
    if (!isValid(draft.a, draft.b)) return;
    const rollback = results;
    setResults((rs) => rs.map((r) => (r.key === court.key ? { ...r, scoreA: draft.a, scoreB: draft.b, completed: true } : r)));
    setReopened((s) => {
      const next = new Set(s);
      next.delete(court.key);
      return next;
    });
    toast({
      type: 'success',
      title: `${gameSlotLabel(court.courtNo, court.waveNo)} final`,
      desc: `${draft.a}–${draft.b} posted — standings & bracket updated.`,
    });
    startTransition(async () => {
      const res = await postCourtScore({
        tournamentId,
        roundId: court.roundId,
        courtNo: court.courtNo,
        waveNo: court.waveNo,
        teamAScore: draft.a,
        teamBScore: draft.b,
      });
      if (!res.ok) {
        toast({ type: 'error', title: 'Could not post score', desc: res.error });
        setResults(rollback);
      }
    });
  }

  const anyGames = results.length > 0;

  return (
    <div className="flex flex-col gap-4">
      {anyGames ? <GamesProgressStrip results={results} /> : null}

      {roundsMeta.length > 1 ? (
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Rounds">
          {roundsMeta.map((r) => {
            const on = r.round === viewRound;
            const dot = r.status === 'final' ? 'var(--court)' : r.status === 'live' ? 'var(--serve)' : 'var(--line-2)';
            const label = r.status === 'final' ? 'Final' : r.status === 'live' ? 'Live' : r.drawn ? 'Upcoming' : 'Not drawn';
            return (
              <button
                key={r.round}
                role="tab"
                aria-selected={on}
                type="button"
                onClick={() => setViewRound(r.round)}
                className="flex items-center gap-2 rounded-full px-3.5 py-2 text-[13px] font-semibold transition-colors"
                style={
                  on
                    ? { background: 'var(--court)', color: 'var(--accent-ink)' }
                    : { background: 'var(--surface-inset)', color: 'var(--ink-2)', border: '1px solid var(--line)' }
                }
              >
                <span
                  className={`h-[7px] w-[7px] rounded-full ${r.status === 'live' ? 'animate-pulse-dot' : ''}`}
                  style={{ background: on && r.status !== 'live' ? 'var(--accent-ink)' : dot }}
                />
                Round {r.round}
                <span className="mono text-[10px] uppercase tracking-[.08em]" style={{ opacity: 0.75 }}>
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      {viewCourts.length === 0 ? (
        <div className="rounded-2xl bg-white p-6 text-center text-sm" style={{ border: '1px dashed var(--line)', color: 'var(--ink-3)' }}>
          Round {viewRound} hasn&apos;t been drawn yet — run the draw on the Run tab to seat it.
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {viewCourts.map((court) => (
            <ScoreCard
              key={court.key}
              court={court}
              draft={drafts[court.key] ?? { a: court.scoreA, b: court.scoreB }}
              editing={court.editable && (!court.completed || reopened.has(court.key))}
              onStep={(side, delta) => setDraft(court.key, side, ((side === 'a' ? drafts[court.key]?.a : drafts[court.key]?.b) ?? 0) + delta)}
              onQuick11={(side) => quick11(court, side)}
              onPost={() => post(court)}
              onReopen={() => setReopened((s) => new Set([...s, court.key]))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
