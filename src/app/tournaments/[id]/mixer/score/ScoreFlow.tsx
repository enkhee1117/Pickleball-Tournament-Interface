'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import type { Theme } from '@/lib/theme';
import { DesktopNav } from '@/components/desktop/DesktopNav';
import { DesktopSurface } from '@/components/desktop/DesktopSurface';
import { CommandBar, type Command } from '@/components/desktop/CommandBar';
import { useToast } from '@/components/desktop/ToastProvider';
import { useRouter } from 'next/navigation';
import { computeStandings, ordinal, type CourtResult, type StandingRow } from './standings';
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

  const [deltas, setDeltas] = useState<Record<string, number>>({});
  const [flashId, setFlashId] = useState<string | null>(null);

  const editableCourts = useMemo(() => results.filter((r) => r.editable), [results]);
  const [selectedKey, setSelectedKey] = useState<string>(editableCourts[0]?.key ?? '');
  const selected = editableCourts.find((r) => r.key === selectedKey) ?? editableCourts[0] ?? null;

  // Which team the keypad is editing.
  const [team, setTeam] = useState<'a' | 'b'>('a');
  // Draft scores for the selected court (seeded from stored scores).
  const [draftA, setDraftA] = useState(selected?.scoreA ?? 0);
  const [draftB, setDraftB] = useState(selected?.scoreB ?? 0);
  const selKeyRef = useRef(selected?.key);

  useEffect(() => {
    if (selected && selected.key !== selKeyRef.current) {
      selKeyRef.current = selected.key;
      setDraftA(selected.scoreA);
      setDraftB(selected.scoreB);
      setTeam('a');
    }
  }, [selected]);

  const posted = selected?.completed ?? false;
  const valid = (draftA >= 11 || draftB >= 11) && Math.abs(draftA - draftB) >= 2;

  const ripple = [
    { id: 'rc1', text: 'Match marked ', b: 'final', tail: ' on the hub & bracket' },
    { id: 'rc2', text: 'Standings re-sorted', b: '', tail: '' },
    { id: 'rc3', text: 'Projector & player phones ', b: 'updated live', tail: '' },
  ];
  const [rippleOn, setRippleOn] = useState<Set<string>>(new Set());
  const [climbMsg, setClimbMsg] = useState('');

  function pressDigit(n: number) {
    if (posted || !selected) return;
    const cur = team === 'a' ? draftA : draftB;
    const nv = cur * 10 + n;
    if (nv > 30) return;
    if (team === 'a') setDraftA(nv);
    else setDraftB(nv);
  }
  function clear() {
    if (posted) return;
    if (team === 'a') setDraftA(0);
    else setDraftB(0);
  }

  function post() {
    if (!selected || posted || !valid) return;

    const prevOrder = standings.map((s) => s.playerId);
    const nextResults = results.map((r) =>
      r.key === selected.key ? { ...r, scoreA: draftA, scoreB: draftB, completed: true } : r,
    );
    const nextStandings = computeStandings(nextResults, namesMap);

    // movement deltas (rows that climbed/fell)
    const nextDeltas: Record<string, number> = {};
    nextStandings.forEach((row, i) => {
      const was = prevOrder.indexOf(row.playerId);
      if (was >= 0) nextDeltas[row.playerId] = was - i;
    });

    // biggest climber among the four affected players
    const affected = new Set([...selected.teamA, ...selected.teamB].map((p) => p.id));
    const climberRow = nextStandings
      .map((row, i) => ({ id: row.playerId, rank: i + 1, gain: nextDeltas[row.playerId] ?? 0 }))
      .filter((c) => affected.has(c.id))
      .reduce<{ id: string; rank: number; gain: number } | null>(
        (best, c) => (best === null || c.gain > best.gain ? c : best),
        null,
      );

    setResults(nextResults);
    setDeltas(nextDeltas);
    if (climberRow && climberRow.gain > 0) {
      setFlashId(climberRow.id);
      setClimbMsg(`${firstName(namesMap.get(climberRow.id) ?? 'A player')} climbed to ${ordinal(climberRow.rank)}`);
    } else {
      setFlashId(null);
      setClimbMsg('');
    }

    // ripple cascade
    setRippleOn(new Set());
    ripple.forEach((r, i) => setTimeout(() => setRippleOn((s) => new Set([...s, r.id])), 500 + i * 450));

    toast({
      type: 'success',
      title: `Round ${selected.roundNo} · Court ${selected.courtNo} final`,
      desc: `${draftA}–${draftB} posted — standings & bracket updated.`,
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

    startTransition(async () => {
      const res = await postCourtScore({
        tournamentId,
        roundId: selected.roundId,
        courtNo: selected.courtNo,
        teamAScore: draftA,
        teamBScore: draftB,
      });
      if (!res.ok) {
        toast({ type: 'error', title: 'Could not post score', desc: res.error });
        // roll back optimistic completion
        setResults(results);
        setDeltas({});
      }
    });
  }

  const commands: Command[] = [
    { group: 'Live', label: 'Present / projector', icon: '▶', run: () => router.push(`/tournaments/${tournamentId}/mixer/present`) },
    { group: 'Live', label: 'Admin cockpit', icon: '◎', run: () => router.push(`/tournaments/${tournamentId}/mixer/admin`) },
    { group: 'Go to', label: 'Player mode', icon: '▦', run: () => router.push(`/tournaments/${tournamentId}/mixer`) },
    { group: 'Go to', label: 'Tournaments', icon: '★', run: () => router.push('/tournaments') },
  ];

  const live = roundState === 'playing' || roundState === 'open';

  return (
    <DesktopSurface variant="default">
      <DesktopNav theme={theme} event={tournamentName} active="Tournaments" live={live} primaryAction="Cockpit" primaryHref={`/tournaments/${tournamentId}/mixer/admin`} />
      <CommandBar commands={commands} />
      <main id="main" className="mx-auto max-w-[1320px] px-8 pb-10 pt-6" style={{ color: 'var(--text)' }}>
        <div className="mb-[22px] flex items-end justify-between gap-5">
          <div>
            <h1 className="serif text-[40px] leading-none">
              One score posts — the whole board <em className="serif-i" style={{ color: 'var(--court-deep)' }}>reacts.</em>
            </h1>
            <p className="mt-2 max-w-[44em] text-[14.5px] leading-[1.55]" style={{ color: 'var(--ink-2)' }}>
              Tap a team, key the final, hit Post — the match settles, standings re-sort with a physical rise, the leader
              updates, and every downstream surface (projector, players, bracket) is notified.
            </p>
          </div>
          {selected ? (
            <span className="chip chip-live whitespace-nowrap">
              <span className="dot" />
              Court {selected.courtNo} · live
            </span>
          ) : null}
        </div>

        {!selected ? (
          <div className="card p-10 text-center" style={{ color: 'var(--ink-3)' }}>
            <div className="serif text-[24px]" style={{ color: 'var(--ink)' }}>No court to score yet</div>
            <p className="mt-2 text-sm">Draw the current round in the cockpit and its courts appear here to score.</p>
          </div>
        ) : (
          <div className="grid grid-cols-[1fr_1.05fr] items-start gap-[22px]">
            {/* SCORE ENTRY */}
            <section className="overflow-hidden rounded-[22px]" style={{ background: 'var(--card)', border: '1px solid var(--line)' }} aria-label="Score entry">
              <div className="flex items-center justify-between border-b p-[16px_22px]" style={{ borderColor: 'var(--line)' }}>
                <span className="mono text-[12px] uppercase tracking-[.12em]" style={{ color: 'var(--ink-3)' }}>
                  Round {selected.roundNo} · Court {selected.courtNo}
                </span>
                {posted ? <span className="chip">Final</span> : <span className="chip chip-live"><span className="dot" />Live</span>}
              </div>

              {editableCourts.length > 1 ? (
                <div className="flex flex-wrap gap-2 border-b p-[12px_22px]" style={{ borderColor: 'var(--line)' }}>
                  {editableCourts.map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => setSelectedKey(c.key)}
                      className="rounded-full px-3 py-1.5 text-[12px] font-semibold"
                      style={
                        c.key === selected.key
                          ? { background: 'var(--court)', color: 'var(--accent-ink)' }
                          : { background: 'var(--paper-2)', color: 'var(--ink-2)', border: '1px solid var(--line)' }
                      }
                    >
                      Court {c.courtNo}
                      {c.completed ? ' ✓' : ''}
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="grid grid-cols-2">
                {(['a', 'b'] as const).map((side) => {
                  const players = side === 'a' ? selected.teamA : selected.teamB;
                  const score = side === 'a' ? draftA : draftB;
                  const editing = team === side && !posted;
                  const isWinner = posted && (side === 'a' ? draftA > draftB : draftB > draftA);
                  return (
                    <button
                      key={side}
                      type="button"
                      onClick={() => !posted && setTeam(side)}
                      className="relative cursor-pointer px-6 pb-[30px] pt-[26px] text-center transition-colors"
                      style={{
                        borderRight: side === 'a' ? '1px solid var(--line)' : undefined,
                        background: editing ? 'var(--paper-2)' : undefined,
                      }}
                      aria-label={`Select team ${players.map((p) => firstName(p.name)).join(' and ')}`}
                    >
                      {isWinner ? (
                        <span
                          className="mono absolute left-1/2 top-3 -translate-x-1/2 rounded-full px-[9px] py-[3px] text-[10px] tracking-[.14em]"
                          style={{ background: 'var(--court)', color: 'var(--accent-ink)' }}
                        >
                          WINNER
                        </span>
                      ) : null}
                      <div className="mb-3 flex justify-center">
                        <Face name={players[0].name} size={52} border="3px solid var(--card)" />
                        <span className="-ml-4">
                          <Face name={players[1].name} size={52} border="3px solid var(--card)" />
                        </span>
                      </div>
                      <div className="text-[16px] font-bold">{players.map((p) => firstName(p.name)).join(' & ')}</div>
                      <div className="mono mt-[3px] text-[11px]" style={{ color: 'var(--ink-3)' }}>
                        Team {side.toUpperCase()}
                        {editing ? ' · editing' : ''}
                      </div>
                      <div
                        className="mono mt-3 text-[82px] font-bold leading-none tracking-[-.04em]"
                        style={{ color: side === 'a' ? 'var(--court-deep)' : 'var(--sky)' }}
                      >
                        {score}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="border-t p-[18px_22px_22px]" style={{ borderColor: 'var(--line)' }}>
                <div className="mb-3 text-center text-[13px]" style={{ color: 'var(--ink-3)' }}>
                  {posted ? (
                    'Score posted ✓'
                  ) : (
                    <>
                      Editing <b style={{ color: 'var(--ink)' }}>{(team === 'a' ? selected.teamA : selected.teamB).map((p) => firstName(p.name)).join(' & ')}</b> — tap the other panel to switch
                    </>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-[10px]">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                    <button key={n} type="button" onClick={() => pressDigit(n)} className="mono keypad-key">
                      {n}
                    </button>
                  ))}
                  <button type="button" onClick={clear} className="keypad-key col-span-2 text-[16px]">
                    Clear
                  </button>
                  <button type="button" onClick={() => pressDigit(0)} className="mono keypad-key">
                    0
                  </button>
                  <button
                    type="button"
                    onClick={post}
                    disabled={posted || !valid}
                    className="col-span-3 rounded-[14px] text-[16px] font-bold disabled:cursor-not-allowed disabled:opacity-40"
                    style={{ background: 'var(--court)', color: 'var(--accent-ink)', height: 60 }}
                  >
                    {posted ? 'Posted ✓' : 'Post final score'}
                  </button>
                </div>
              </div>
            </section>

            {/* STANDINGS */}
            <aside className="rounded-[22px] p-[20px_22px_24px]" style={{ background: 'var(--card)', border: '1px solid var(--line)' }} aria-label="Live standings">
              <div className="mb-1.5 flex items-center justify-between">
                <h2 className="text-[19px] font-semibold">Standings</h2>
                <span className="mono text-[11px] uppercase tracking-[.08em]" style={{ color: 'var(--ink-3)' }}>
                  {roundNo > 0 ? `Round ${roundNo} of ${roundsTotal} · live` : 'live'}
                </span>
              </div>
              <StandingsList standings={standings} deltas={deltas} flashId={flashId} />

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
        )}
      </main>

      <style>{`
        .keypad-key { height: 60px; border: 1px solid var(--line); background: var(--paper); border-radius: 14px; font-weight: 700; font-size: 26px; color: var(--ink); cursor: pointer; transition: transform .1s, background .12s; }
        .keypad-key:hover { background: var(--paper-2); }
        .keypad-key:active { transform: scale(.94); }
      `}</style>
    </DesktopSurface>
  );
}

function StandingsList({
  standings,
  deltas,
  flashId,
}: {
  standings: StandingRow[];
  deltas: Record<string, number>;
  flashId: string | null;
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
      {standings.map((row, i) => {
        const mv = deltas[row.playerId] ?? 0;
        const flash = flashId === row.playerId;
        return (
          <div
            key={row.playerId}
            className="grid grid-cols-[34px_1fr_60px_56px] items-center gap-2 rounded-[13px] p-[11px_12px]"
            style={{
              background: flash ? 'color-mix(in oklch, var(--court) 22%, transparent)' : undefined,
              transition: 'background .3s',
              animation: flash ? 'climb .6s cubic-bezier(.3,1,.4,1) both' : undefined,
            }}
          >
            <span className="mono flex items-center gap-[5px] text-[15px] font-bold" style={{ color: 'var(--ink-3)' }}>
              {i + 1}
              {mv ? (
                <span className="mono text-[11px] font-bold" style={{ color: mv > 0 ? 'var(--court-deep)' : 'var(--berry)' }}>
                  {mv > 0 ? '▲' : '▼'}
                  {Math.abs(mv)}
                </span>
              ) : null}
            </span>
            <span className="flex min-w-0 items-center gap-[10px]">
              <Face name={row.name} size={32} />
              <span className="truncate text-[15px] font-semibold">{firstName(row.name)}</span>
            </span>
            <span className="mono text-right text-[14px]" style={{ color: 'var(--ink-2)' }}>
              {row.wins}–{row.losses}
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
