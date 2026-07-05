'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import type { Theme } from '@/lib/theme';
import { DesktopNav } from '@/components/desktop/DesktopNav';
import { DesktopSurface } from '@/components/desktop/DesktopSurface';
import { CommandBar, type Command } from '@/components/desktop/CommandBar';
import { useToast } from '@/components/desktop/ToastProvider';
import { useRouter } from 'next/navigation';
import { computeStandings, gameSlotLabel, ordinal, playerGamesMap, type CourtResult, type PlayerGames, type StandingRow } from '@/lib/mixer-standings';
import { GamesProgressStrip } from '@/components/ui/GamesProgressStrip';
import { postCourtScore } from './actions';

const firstName = (n: string) => n.split(' ')[0];
const initials = (n: string) =>
  n
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

const WIN_BY = 2;
const GAME_TO = 11;
const isValid = (a: number, b: number) => (a >= GAME_TO || b >= GAME_TO) && Math.abs(a - b) >= WIN_BY;

function Face({ name, size = 32, border }: { name: string; size?: number; border?: string }) {
  return (
    <span
      className="av"
      style={{ width: size, height: size, fontSize: size * 0.36, border, color: 'var(--court-deep)' }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

function sig(results: CourtResult[]): string {
  return results.map((r) => `${r.key}:${r.completed ? 1 : 0}:${r.scoreA}:${r.scoreB}`).join('|');
}

type RoundStatus = 'final' | 'live' | 'up';

export function ScoreFlow({
  theme,
  tournamentId,
  tournamentName,
  roundNo,
  roundsTotal,
  roundState,
  playerCount,
  results: initialResults,
}: {
  theme: Theme;
  tournamentId: string;
  tournamentName: string;
  roundNo: number;
  roundsTotal: number;
  roundState: string;
  playerCount: number;
  results: CourtResult[];
}) {
  const toast = useToast();
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [results, setResults] = useState<CourtResult[]>(initialResults);
  const propSig = sig(initialResults);
  const lastPropSig = useRef(propSig);
  // Re-seed from the server whenever authoritative data changes (revalidate /
  // realtime). Since a local post mutates to the same values the server will
  // persist, this reconciles without a visible flip.
  useEffect(() => {
    if (propSig !== lastPropSig.current) {
      lastPropSig.current = propSig;
      setResults(initialResults);
      setDrafts(seedDrafts(initialResults));
      setReopened(new Set());
      setDeltas({});
      setFlashId(null);
    }
  }, [propSig, initialResults]);

  const namesMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of results) for (const p of [...r.teamA, ...r.teamB]) m.set(p.id, p.name);
    return m;
  }, [results]);

  const standings = useMemo(() => computeStandings(results, namesMap), [results, namesMap]);
  const gamesMap = useMemo(() => playerGamesMap(results), [results]);

  const [deltas, setDeltas] = useState<Record<string, number>>({});
  const [flashId, setFlashId] = useState<string | null>(null);

  // Draft scores per court key, and which final cards the organizer reopened.
  const [drafts, setDrafts] = useState<Record<string, { a: number; b: number }>>(() => seedDrafts(initialResults));
  const [reopened, setReopened] = useState<Set<string>>(new Set());

  // Rounds 1..roundsTotal with a status derived from their drawn games. Rounds
  // with no results yet are "up" (not drawn) — the tab still shows so the night
  // reads as a whole.
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
    // Follow the live round when it advances, but don't yank the organizer off
    // a round they deliberately clicked into.
    if (liveRound && liveRound !== viewMetaRef.current) {
      viewMetaRef.current = liveRound;
      setViewRound(liveRound);
    }
  }, [liveRound]);

  const viewCourts = useMemo(
    () => results.filter((r) => r.roundNo === viewRound).sort((a, b) => a.courtNo - b.courtNo || a.waveNo - b.waveNo),
    [results, viewRound],
  );

  const ripple = [
    { id: 'rc1', text: 'Match marked ', b: 'final', tail: ' on the hub & bracket' },
    { id: 'rc2', text: 'Standings re-sorted', b: '', tail: '' },
    { id: 'rc3', text: 'Projector & player phones ', b: 'updated live', tail: '' },
  ];
  const [rippleOn, setRippleOn] = useState<Set<string>>(new Set());
  const [climbMsg, setClimbMsg] = useState('');

  function setDraft(key: string, side: 'a' | 'b', value: number) {
    setDrafts((d) => ({ ...d, [key]: { ...(d[key] ?? { a: 0, b: 0 }), [side]: Math.max(0, Math.min(30, value)) } }));
  }
  function quick11(court: CourtResult, side: 'a' | 'b') {
    const cur = drafts[court.key] ?? { a: 0, b: 0 };
    const other = side === 'a' ? cur.b : cur.a;
    const val = other >= GAME_TO - 1 ? other + WIN_BY : GAME_TO; // deuce → win by 2
    setDraft(court.key, side, val);
  }

  function post(court: CourtResult) {
    const draft = drafts[court.key] ?? { a: 0, b: 0 };
    if (!isValid(draft.a, draft.b)) return;

    const prevOrder = standings.map((s) => s.playerId);
    const nextResults = results.map((r) =>
      r.key === court.key ? { ...r, scoreA: draft.a, scoreB: draft.b, completed: true } : r,
    );
    const nextStandings = computeStandings(nextResults, namesMap);

    const nextDeltas: Record<string, number> = {};
    nextStandings.forEach((row, i) => {
      const was = prevOrder.indexOf(row.playerId);
      if (was >= 0) nextDeltas[row.playerId] = was - i;
    });

    const affected = new Set([...court.teamA, ...court.teamB].map((p) => p.id));
    const climberRow = nextStandings
      .map((row, i) => ({ id: row.playerId, rank: i + 1, gain: nextDeltas[row.playerId] ?? 0 }))
      .filter((c) => affected.has(c.id))
      .reduce<{ id: string; rank: number; gain: number } | null>(
        (best, c) => (best === null || c.gain > best.gain ? c : best),
        null,
      );

    setResults(nextResults);
    setReopened((s) => {
      const next = new Set(s);
      next.delete(court.key);
      return next;
    });
    setDeltas(nextDeltas);
    if (climberRow && climberRow.gain > 0) {
      setFlashId(climberRow.id);
      setClimbMsg(`${firstName(namesMap.get(climberRow.id) ?? 'A player')} climbed to ${ordinal(climberRow.rank)}`);
    } else {
      setFlashId(null);
      setClimbMsg('');
    }

    setRippleOn(new Set());
    ripple.forEach((r, i) => setTimeout(() => setRippleOn((s) => new Set([...s, r.id])), 500 + i * 450));

    toast({
      type: 'success',
      title: `Round ${court.roundNo} · ${gameSlotLabel(court.courtNo, court.waveNo)} final`,
      desc: `${draft.a}–${draft.b} posted — standings & bracket updated.`,
      duration: 5000,
    });
    if (climberRow && climberRow.gain > 0) {
      const msgId = climberRow.id;
      const msgRank = climberRow.rank;
      setTimeout(
        () =>
          toast({
            type: 'info',
            title: `${firstName(namesMap.get(msgId) ?? 'A player')} climbed to ${ordinal(msgRank)}`,
            desc: `Notified on the projector and ${playerCount} player phones.`,
            duration: 5000,
          }),
        900,
      );
    }

    const rollback = results;
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
        setDeltas({});
      }
    });
  }

  const commands: Command[] = [
    { group: 'Live', label: 'Present / projector', icon: '▶', run: () => router.push(`/tournaments/${tournamentId}/mixer/present`) },
    { group: 'Live', label: 'Organizer cockpit', icon: '◎', run: () => router.push(`/tournaments/${tournamentId}/mixer/admin`) },
    { group: 'Go to', label: 'Player mode', icon: '▦', run: () => router.push(`/tournaments/${tournamentId}/mixer`) },
    { group: 'Go to', label: 'Tournaments', icon: '★', run: () => router.push('/tournaments') },
  ];

  const live = roundState === 'playing' || roundState === 'open';
  const anyGames = results.length > 0;

  return (
    <DesktopSurface variant="default">
      <DesktopNav theme={theme} event={tournamentName} active="Tournaments" live={live} primaryAction="Cockpit" primaryHref={`/tournaments/${tournamentId}/mixer/admin`} />
      <CommandBar commands={commands} />
      <main id="main" className="mx-auto max-w-[1320px] px-8 pb-10 pt-6" style={{ color: 'var(--text)' }}>
        <div className="mb-[22px]">
          <h1 className="serif text-[40px] leading-none">
            One score posts — the whole board <em className="serif-i" style={{ color: 'var(--court-deep)' }}>reacts.</em>
          </h1>
          <p className="mt-2 max-w-[44em] text-[14.5px] leading-[1.55]" style={{ color: 'var(--ink-2)' }}>
            Tap a team, key the final, hit Record — the match settles, standings re-sort with a physical rise, and every
            downstream surface (projector, players, bracket) is notified.
          </p>
        </div>

        {anyGames ? <GamesProgressStrip results={results} className="mb-5" /> : null}

        {/* ROUND TABS */}
        <div className="mb-5 flex flex-wrap gap-2" role="tablist" aria-label="Rounds">
          {roundsMeta.map((r) => {
            const on = r.round === viewRound;
            const dot =
              r.status === 'final' ? 'var(--court)' : r.status === 'live' ? 'var(--serve)' : 'var(--line-2)';
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

        <div className="grid grid-cols-[1.15fr_0.85fr] items-start gap-[22px] max-lg:grid-cols-1">
          {/* SCORE ENTRY — a card per court for the viewed round */}
          <section className="flex flex-col gap-4" aria-label="Score entry">
            {viewCourts.length === 0 ? (
              <div className="card p-10 text-center">
                <div className="serif text-[24px]" style={{ color: 'var(--ink)' }}>
                  Round {viewRound} hasn&apos;t been drawn yet
                </div>
                <p className="mt-2 text-sm" style={{ color: 'var(--ink-3)' }}>
                  Run the draw in the cockpit to pair players for this round — the courts appear here, ready to score.
                </p>
                <button
                  type="button"
                  onClick={() => router.push(`/tournaments/${tournamentId}/mixer/admin`)}
                  className="mt-5 rounded-[14px] px-5 py-3 text-[14px] font-bold"
                  style={{ background: 'var(--court)', color: 'var(--accent-ink)' }}
                >
                  Run the draw for Round {viewRound} →
                </button>
              </div>
            ) : (
              viewCourts.map((court) => (
                <ScoreCard
                  key={court.key}
                  court={court}
                  draft={drafts[court.key] ?? { a: court.scoreA, b: court.scoreB }}
                  editing={court.editable && (!court.completed || reopened.has(court.key))}
                  onStep={(side, delta) =>
                    setDraft(court.key, side, ((side === 'a' ? drafts[court.key]?.a : drafts[court.key]?.b) ?? 0) + delta)
                  }
                  onQuick11={(side) => quick11(court, side)}
                  onPost={() => post(court)}
                  onReopen={() => setReopened((s) => new Set([...s, court.key]))}
                />
              ))
            )}
          </section>

          {/* STANDINGS */}
          <aside className="rounded-[22px] p-[20px_22px_24px]" style={{ background: 'var(--card)', border: '1px solid var(--line)' }} aria-label="Live standings">
            <div className="mb-1.5 flex items-center justify-between">
              <h2 className="text-[19px] font-semibold">Standings</h2>
              <span className="mono text-[11px] uppercase tracking-[.08em]" style={{ color: 'var(--ink-3)' }}>
                {roundNo > 0 ? `Round ${roundNo} of ${roundsTotal} · live` : 'live'}
              </span>
            </div>
            <StandingsList standings={standings} deltas={deltas} flashId={flashId} gamesMap={gamesMap} />

            <div className="mt-4 flex flex-col gap-[9px] border-t pt-3.5" style={{ borderColor: 'var(--line)' }}>
              <div className="mono text-[10px] uppercase tracking-[.1em]" style={{ color: 'var(--ink-3)' }}>
                When you post, this happens
              </div>
              {ripple.map((r) => {
                const on = rippleOn.has(r.id);
                const text =
                  r.id === 'rc2' && climbMsg ? (
                    <>Standings re-sorted — <b style={{ color: 'var(--ink)' }}>{climbMsg}</b></>
                  ) : (
                    <>
                      {r.text}
                      {r.b ? <b style={{ color: 'var(--ink)' }}>{r.b}</b> : null}
                      {r.tail}
                    </>
                  );
                return (
                  <div
                    key={r.id}
                    className="flex items-center gap-[10px] text-[13px]"
                    style={{
                      color: 'var(--ink-2)',
                      opacity: on ? 1 : 0,
                      transform: on ? 'none' : 'translateX(-8px)',
                      transition: 'opacity .4s, transform .4s',
                    }}
                  >
                    <span className="h-[7px] w-[7px] flex-shrink-0 rounded-full" style={{ background: 'var(--court)' }} />
                    {text}
                  </div>
                );
              })}
            </div>
          </aside>
        </div>
      </main>
    </DesktopSurface>
  );
}

function seedDrafts(results: CourtResult[]): Record<string, { a: number; b: number }> {
  const d: Record<string, { a: number; b: number }> = {};
  for (const r of results) d[r.key] = { a: r.scoreA, b: r.scoreB };
  return d;
}

function ScoreCard({
  court,
  draft,
  editing,
  onStep,
  onQuick11,
  onPost,
  onReopen,
}: {
  court: CourtResult;
  draft: { a: number; b: number };
  editing: boolean;
  onStep: (side: 'a' | 'b', delta: number) => void;
  onQuick11: (side: 'a' | 'b') => void;
  onPost: () => void;
  onReopen: () => void;
}) {
  const valid = isValid(draft.a, draft.b);
  const live = court.editable && !court.completed;
  const spine = court.completed ? 'var(--court)' : live ? 'var(--serve)' : 'var(--line-2)';

  return (
    <div
      className="overflow-hidden rounded-[18px]"
      style={{ background: 'var(--card)', border: '1px solid var(--line)', borderLeft: `4px solid ${spine}` }}
    >
      <div className="flex items-center justify-between border-b p-[13px_18px]" style={{ borderColor: 'var(--line)' }}>
        <span className="mono text-[12px] uppercase tracking-[.12em]" style={{ color: 'var(--ink-3)' }}>
          {gameSlotLabel(court.courtNo, court.waveNo)}
        </span>
        {court.completed ? (
          <span className="chip" style={{ background: 'color-mix(in oklch, var(--court) 20%, transparent)', color: 'var(--court-deep)' }}>
            Final
          </span>
        ) : live ? (
          <span className="chip chip-live"><span className="dot" />On court</span>
        ) : (
          <span className="chip">Upcoming</span>
        )}
      </div>

      <div className="grid grid-cols-2">
        {(['a', 'b'] as const).map((side) => {
          const players = side === 'a' ? court.teamA : court.teamB;
          const score = side === 'a' ? draft.a : draft.b;
          const isWinner = court.completed && (side === 'a' ? draft.a > draft.b : draft.b > draft.a);
          const isLoser = court.completed && !isWinner && draft.a !== draft.b;
          return (
            <div
              key={side}
              className="relative px-5 pb-5 pt-[18px] text-center"
              style={{
                borderRight: side === 'a' ? '1px solid var(--line)' : undefined,
                background: isWinner ? 'color-mix(in oklch, var(--court) 12%, transparent)' : undefined,
                opacity: isLoser ? 0.55 : 1,
              }}
            >
              <div className="mb-2.5 flex justify-center">
                <Face name={players[0].name} size={44} border="3px solid var(--card)" />
                <span className="-ml-3.5">
                  <Face name={players[1].name} size={44} border="3px solid var(--card)" />
                </span>
              </div>
              <div className="text-[15px] font-bold">{players.map((p) => firstName(p.name)).join(' & ')}</div>
              <div
                className="mono mt-2 text-[64px] font-bold leading-none tracking-[-.04em]"
                style={{ color: isLoser ? 'var(--ink-3)' : side === 'a' ? 'var(--court-deep)' : 'var(--sky)' }}
              >
                {score}
              </div>

              {editing ? (
                <div className="mt-3 flex items-center justify-center gap-2">
                  <button
                    type="button"
                    aria-label={`Remove a point from team ${side.toUpperCase()}`}
                    onClick={() => onStep(side, -1)}
                    disabled={score <= 0}
                    className="flex h-10 w-10 items-center justify-center rounded-[12px] text-[20px] font-bold disabled:opacity-35"
                    style={{ border: '1px solid var(--line)', color: 'var(--ink)' }}
                  >
                    −
                  </button>
                  <button
                    type="button"
                    aria-label={`Add a point to team ${side.toUpperCase()}`}
                    onClick={() => onStep(side, 1)}
                    className="flex h-10 w-10 items-center justify-center rounded-[12px] text-[20px] font-bold"
                    style={{ background: side === 'a' ? 'var(--court)' : 'var(--sky)', color: 'var(--accent-ink)' }}
                  >
                    +
                  </button>
                  <button
                    type="button"
                    onClick={() => onQuick11(side)}
                    className="mono ml-1 rounded-[9px] px-2.5 py-2 text-[13px] font-bold"
                    style={{ background: 'color-mix(in oklch, var(--court) 18%, transparent)', color: 'var(--court-deep)' }}
                  >
                    11
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="border-t p-[14px_18px]" style={{ borderColor: 'var(--line)' }}>
        {editing ? (
          <button
            type="button"
            onClick={onPost}
            disabled={!valid}
            className="w-full rounded-[14px] text-[15px] font-bold disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: 'var(--court)', color: 'var(--accent-ink)', height: 52 }}
          >
            Record final
          </button>
        ) : court.completed && court.editable ? (
          <button
            type="button"
            onClick={onReopen}
            className="w-full rounded-[14px] text-[14px] font-semibold"
            style={{ border: '1px solid var(--line)', color: 'var(--ink-2)', height: 48 }}
          >
            Reopen to edit
          </button>
        ) : (
          <div className="text-center text-[12.5px]" style={{ color: 'var(--ink-3)' }}>
            {court.completed ? 'Final — locked for this round' : 'Waiting to start'}
          </div>
        )}
        {editing && !valid ? (
          <div className="mt-2 text-center text-[11.5px]" style={{ color: 'var(--ink-3)' }}>
            A team needs {GAME_TO}+ and a {WIN_BY}-point lead to record.
          </div>
        ) : null}
      </div>
    </div>
  );
}

function GamesDots({ games }: { games: PlayerGames | undefined }) {
  const scheduled = games?.scheduled ?? 0;
  const played = games?.played ?? 0;
  const onCourt = games?.onCourt ?? false;
  if (scheduled === 0) return <span />;
  return (
    <span className="flex items-center justify-end gap-[7px]" title={`${played} of ${scheduled} games played`}>
      <span className="flex gap-[3px]" aria-hidden>
        {Array.from({ length: scheduled }, (_, i) => {
          // The last still-unplayed dot glows orange while the player is on court.
          const live = onCourt && i === played;
          const bg = i < played ? 'var(--court)' : live ? 'var(--serve)' : 'var(--line-2)';
          return <span key={i} className={`h-[7px] w-[7px] rounded-full ${live ? 'animate-pulse-dot' : ''}`} style={{ background: bg }} />;
        })}
      </span>
      <span className="mono text-[12px]" style={{ color: 'var(--ink-3)' }}>{played}/{scheduled}</span>
    </span>
  );
}

function StandingsList({
  standings,
  deltas,
  flashId,
  gamesMap,
}: {
  standings: StandingRow[];
  deltas: Record<string, number>;
  flashId: string | null;
  gamesMap: Map<string, PlayerGames>;
}) {
  if (standings.length === 0) {
    return (
      <div className="mt-3 rounded-[13px] p-6 text-center text-[13px]" style={{ color: 'var(--ink-3)', background: 'var(--paper-2)' }}>
        No results yet — post a court to build the board.
      </div>
    );
  }
  return (
    <div className="relative mt-3">
      <div className="mono mb-1 grid grid-cols-[30px_1fr_52px_44px] items-center gap-2 px-3 text-[10px] uppercase tracking-[.08em]" style={{ color: 'var(--ink-3)' }}>
        <span>#</span>
        <span>Player</span>
        <span className="text-right">Games</span>
        <span className="text-right">Pts</span>
      </div>
      {standings.map((row, i) => {
        const mv = deltas[row.playerId] ?? 0;
        const flash = flashId === row.playerId;
        return (
          <div
            key={row.playerId}
            className="grid grid-cols-[30px_1fr_52px_44px] items-center gap-2 rounded-[13px] p-[10px_12px]"
            style={{
              background: flash ? 'color-mix(in oklch, var(--court) 22%, transparent)' : undefined,
              transition: 'background .3s',
              animation: flash ? 'climb .6s cubic-bezier(.3,1,.4,1) both' : undefined,
            }}
          >
            <span className="mono flex items-center gap-[4px] text-[15px] font-bold" style={{ color: 'var(--ink-3)' }}>
              {i + 1}
              {mv ? (
                <span className="mono text-[10px] font-bold" style={{ color: mv > 0 ? 'var(--court-deep)' : 'var(--berry)' }}>
                  {mv > 0 ? '▲' : '▼'}
                  {Math.abs(mv)}
                </span>
              ) : null}
            </span>
            <span className="flex min-w-0 items-center gap-[10px]">
              <Face name={row.name} size={30} />
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-semibold leading-tight">{firstName(row.name)}</span>
                <span className="mono text-[11px]" style={{ color: 'var(--ink-3)' }}>{row.wins}–{row.losses}</span>
              </span>
            </span>
            <GamesDots games={gamesMap.get(row.playerId)} />
            <span className="mono text-right text-[15px] font-bold" style={{ color: 'var(--court-deep)' }}>
              {row.points}
            </span>
          </div>
        );
      })}
    </div>
  );
}
