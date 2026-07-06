'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import type { Theme } from '@/lib/theme';
import { DesktopNav } from '@/components/desktop/DesktopNav';
import { DesktopSurface } from '@/components/desktop/DesktopSurface';
import { CommandBar, type Command } from '@/components/desktop/CommandBar';
import { useToast } from '@/components/desktop/ToastProvider';
import { useRouter } from 'next/navigation';
import { computeStandings, gameSlotLabel, ordinal, playerGamesMap, tallyGames, type CourtResult, type PlayerGames, type StandingRow } from '@/lib/mixer-standings';
import { GamesProgressStrip } from '@/components/ui/GamesProgressStrip';
import { MedalPodium, type PodiumEntry } from '@/components/ui/MedalPodium';
import { Face, ScoreCard, firstName, isValid, winValue } from '../_components/score-cards';
import type { PlayerRow } from '../_types';
import { finalizeMixerEvent } from '../actions';
import { ActionForm } from '../_components/ActionForm';
import { postCourtScore } from './actions';

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
  finalized,
  genders,
}: {
  theme: Theme;
  tournamentId: string;
  tournamentName: string;
  roundNo: number;
  roundsTotal: number;
  roundState: string;
  playerCount: number;
  results: CourtResult[];
  finalized: boolean;
  genders: Record<string, PlayerRow['gender']>;
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
  const gamesLeft = useMemo(() => tallyGames(results).left, [results]);

  // Podium (finalized board): top-3 overall and, when the field has both, split
  // by gender. Entries carry no "you" on the organizer board.
  const toEntry = (row: StandingRow): PodiumEntry => ({ playerId: row.playerId, name: row.name, points: row.points });
  const women = standings.filter((r) => genders[r.playerId] === 'f');
  const men = standings.filter((r) => genders[r.playerId] === 'm');
  const canSplit = women.length >= 1 && men.length >= 1;
  const [podMode, setPodMode] = useState<'overall' | 'gender'>('overall');

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
    setDraft(court.key, side, winValue(other));
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
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <h2 className="text-[19px] font-semibold">Standings</h2>
              {finalized ? (
                <span className="chip" style={{ background: 'color-mix(in oklch, var(--court) 20%, transparent)', color: 'var(--court-deep)' }}>
                  Final
                </span>
              ) : (
                <span className="mono text-[11px] uppercase tracking-[.08em]" style={{ color: 'var(--ink-3)' }}>
                  {roundNo > 0 ? `Round ${roundNo} of ${roundsTotal} · live` : 'live'}
                </span>
              )}
            </div>

            {finalized && standings.length > 0 ? (
              <div className="mb-4 rounded-[16px] p-4" style={{ background: 'var(--surface-inset)', border: '1px solid var(--line)' }}>
                {canSplit ? (
                  <div className="mb-3 flex justify-center">
                    <div className="flex rounded-full p-0.5" style={{ background: 'var(--card)', border: '1px solid var(--line)' }}>
                      {(['overall', 'gender'] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setPodMode(m)}
                          className="rounded-full px-3 py-1 text-[12px] font-semibold"
                          style={podMode === m ? { background: 'var(--court)', color: 'var(--accent-ink)' } : { color: 'var(--ink-2)' }}
                        >
                          {m === 'overall' ? 'Overall' : 'By gender'}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {canSplit && podMode === 'gender' ? (
                  <div className="grid grid-cols-2 gap-3">
                    <MedalPodium title="Women" small top3={women.slice(0, 3).map(toEntry)} />
                    <MedalPodium title="Men" small top3={men.slice(0, 3).map(toEntry)} />
                  </div>
                ) : (
                  <MedalPodium top3={standings.slice(0, 3).map(toEntry)} />
                )}
              </div>
            ) : null}

            <StandingsList standings={standings} deltas={finalized ? {} : deltas} flashId={finalized ? null : flashId} gamesMap={gamesMap} />

            {!finalized && standings.length > 0 ? (
              <ActionForm
                action={finalizeMixerEvent}
                className="mt-3"
                confirm={
                  gamesLeft > 0
                    ? `${gamesLeft} game${gamesLeft === 1 ? '' : 's'} still unplayed. Finalize standings anyway? This locks the board, reveals the podium, and settles the raffle & pools.`
                    : 'Finalize standings? This locks the board, reveals the podium, and settles the raffle & pools.'
                }
                successToast="Standings finalized"
              >
                <input type="hidden" name="tournament_id" value={tournamentId} />
                <button
                  type="submit"
                  className="w-full rounded-[14px] py-3 text-[14px] font-bold"
                  style={
                    gamesLeft > 0
                      ? { background: 'color-mix(in oklch, var(--berry) 12%, var(--card))', color: 'var(--berry)', border: '1px solid color-mix(in oklch, var(--berry) 40%, var(--line))' }
                      : { background: 'var(--court)', color: 'var(--accent-ink)' }
                  }
                >
                  {gamesLeft > 0 ? `Finalize anyway (${gamesLeft} left)` : 'Finalize standings'}
                </button>
              </ActionForm>
            ) : null}

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
      <div className="mono mb-1 grid grid-cols-[30px_1fr_52px_40px_40px] items-center gap-2 px-3 text-[10px] uppercase tracking-[.08em]" style={{ color: 'var(--ink-3)' }}>
        <span>#</span>
        <span>Player</span>
        <span className="text-right">Games</span>
        <span className="text-right">Diff</span>
        <span className="text-right">Pts</span>
      </div>
      {standings.map((row, i) => {
        const mv = deltas[row.playerId] ?? 0;
        const flash = flashId === row.playerId;
        return (
          <div
            key={row.playerId}
            className="grid grid-cols-[30px_1fr_52px_40px_40px] items-center gap-2 rounded-[13px] p-[10px_12px]"
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
            <span className="mono text-right text-[13px]" style={{ color: 'var(--ink-2)' }}>
              {row.pointDiff > 0 ? '+' : ''}{row.pointDiff}
            </span>
            <span className="mono text-right text-[15px] font-bold" style={{ color: 'var(--court-deep)' }}>
              {row.points}
            </span>
          </div>
        );
      })}
    </div>
  );
}
