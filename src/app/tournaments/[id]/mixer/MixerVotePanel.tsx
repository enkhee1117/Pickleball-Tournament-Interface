'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { Icons } from '@/components/ui/icons';
import { eligibleBallotTargets } from '@/lib/mixer';
import { Dink, mixerAvatarFor } from './_components/mixer-night';
import { CountdownTimer } from './_components/CountdownTimer';
import { saveMixerBallot } from './actions';

// Player ballot — rebuilt to the handoff player.html spec: candidate cards
// with − n + steppers and a "rather not" toggle, a desktop ballot rail with
// the live allocation summary, and a plain-language "how the draw works"
// fairness card. Votes stay blind; everything here is the caller's own data.
//
// Token flow: the ballot is tracked LOCALLY as the player taps. Changes save
// quietly in the background (one debounced batched write per round, never a
// round-trip per tap) and there's an explicit "Lock in my ballot" button for
// closure. A player who edits and walks away still has their picks saved.

type ConfigRow = {
  starting_tokens: number;
  rounds: number;
  downvotes_enabled: boolean;
  upvote_cap_per_target?: number | null;
  alpha?: number;
  beta?: number;
  gamma?: number;
};

type RoundRow = {
  id: string;
  round_no: number;
  state: string;
  lock_at: string | null;
};

type PlayerRow = {
  id: string;
  display_name: string;
  gender: 'm' | 'f' | 'x' | null;
  dupr: number | null;
};

type StateRow = {
  player_id: string;
  pairing_pool: 'a' | 'b';
  tokens_base_remaining: number;
  tokens_bought_remaining: number;
};

type VoteRow = {
  round_id: string;
  target_player_id: string;
  up_tokens: number;
  down_tokens: number;
};

// Local ballot cell for the round being edited.
type Cell = { up: number; down: number };
type Ballot = Record<string, Cell>;
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const NIGHT_CARD = 'var(--night-card)';
const NIGHT_LINE = 'var(--night-line)';
const NIGHT_TEXT2 = 'var(--night-text2)';
const NIGHT_TEXT3 = 'var(--night-text3)';

function ballotFromVotes(votes: VoteRow[], roundId: string): Ballot {
  const out: Ballot = {};
  for (const v of votes) {
    if (v.round_id !== roundId) continue;
    if (v.up_tokens > 0 || v.down_tokens > 0) out[v.target_player_id] = { up: v.up_tokens, down: v.down_tokens };
  }
  return out;
}

const ballotSpent = (b: Ballot) => Object.values(b).reduce((s, c) => s + c.up + c.down, 0);
const ballotToArray = (b: Ballot) =>
  Object.entries(b)
    .filter(([, c]) => c.up > 0 || c.down > 0)
    .map(([target_player_id, c]) => ({ target_player_id, up_tokens: c.up, down_tokens: c.down }));

export function MixerVotePanel({
  tournamentId,
  round,
  rounds,
  eventRoundCount,
  config,
  roster,
  states,
  myPlayer,
  myState,
  votes,
  confirmedRoundIds = [],
  genderMode = 'mixed',
}: {
  tournamentId: string;
  round: RoundRow;
  rounds: RoundRow[];
  eventRoundCount: number;
  config: ConfigRow;
  roster: PlayerRow[];
  states: StateRow[];
  myPlayer: PlayerRow;
  myState: StateRow | null;
  votes: VoteRow[];
  confirmedRoundIds?: string[];
  genderMode?: string;
}) {
  const [showHow, setShowHow] = useState(false);
  const myPool = states.find((s) => s.player_id === myPlayer.id)?.pairing_pool;
  // Eligible ballot targets follow the event's gender mode: mixed shows the
  // opposite pool (classic mixer), same shows your own gender, open shows
  // everyone. Mirrors the draw's pairing constraints so players never spend
  // tokens on someone they can't be paired with.
  const targets = eligibleBallotTargets(roster, myPlayer, genderMode, myPool);
  // A per-target upvote cap is only a real limit at 1–99; the default is a huge
  // sentinel (migration 0054) meaning "no limit", which we treat as Infinity so
  // the stepper never blocks and no "at cap" hint shows.
  const upvoteCap =
    config.upvote_cap_per_target != null && config.upvote_cap_per_target <= 99
      ? Math.max(1, config.upvote_cap_per_target)
      : Infinity;
  const locked = round.state !== 'open' || (round.lock_at ? new Date(round.lock_at).getTime() <= Date.now() : false);
  const nameOf = (id: string) => roster.find((p) => p.id === id)?.display_name ?? '—';

  // Honest budget = the player's ACTUAL grant, derived from the DB wallet, not
  // the config ceiling. `remaining + spent` is invariant to spending, so it
  // equals the real number of tokens they hold. (The old code took
  // Math.max(config.starting_tokens, …), which showed a budget the DB refused
  // to honor whenever starting_tokens was raised without re-granting.)
  const serverSpent = votes.reduce((s, v) => s + v.up_tokens + v.down_tokens, 0);
  const serverRemaining = (myState?.tokens_base_remaining ?? config.starting_tokens) + (myState?.tokens_bought_remaining ?? 0);
  const budget = serverRemaining + serverSpent;
  // Tokens this player has committed in OTHER rounds (fixed server data) — the
  // current round is now tracked locally.
  const serverCurrentRoundSpent = votes
    .filter((v) => v.round_id === round.id)
    .reduce((s, v) => s + v.up_tokens + v.down_tokens, 0);
  const otherRoundsSpent = serverSpent - serverCurrentRoundSpent;

  // --- Local ballot state (source of truth while editing) ---------------
  const serverBallot = useMemo(() => ballotFromVotes(votes, round.id), [votes, round.id]);
  const [ballot, setBallot] = useState<Ballot>(serverBallot);
  const [confirmed, setConfirmed] = useState(confirmedRoundIds.includes(round.id));
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);

  const latestBallotRef = useRef(ballot);
  latestBallotRef.current = ballot;
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const pendingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confirmedRef = useRef(confirmed);
  confirmedRef.current = confirmed;
  // Carries an explicit confirm/unconfirm intent into the next save; null means
  // "leave confirmation as-is" (a plain auto-save).
  const nextConfirmRef = useRef<boolean | null>(null);

  const roundSpent = ballotSpent(ballot);
  const totalSpent = otherRoundsSpent + roundSpent;
  const left = Math.max(0, budget - totalSpent);

  // Re-sync from the server when the round changes (RoundSelector is a client
  // nav that swaps props without unmounting) or when fresh server data arrives
  // while we have no unsaved edits (e.g. a realtime refresh).
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    dirtyRef.current = false;
    pendingRef.current = false;
    nextConfirmRef.current = null;
    setBallot(serverBallot);
    setConfirmed(confirmedRoundIds.includes(round.id));
    setSaveState('idle');
    setSaveError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round.id]);

  useEffect(() => {
    if (dirtyRef.current || savingRef.current) return;
    setBallot(serverBallot);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverBallot]);

  const runSave = useCallback(async () => {
    if (locked) return;
    if (savingRef.current) {
      pendingRef.current = true;
      return;
    }
    savingRef.current = true;
    setSaveState('saving');
    setSaveError(null);
    const confirmArg = nextConfirmRef.current;
    nextConfirmRef.current = null;
    const res = await saveMixerBallot({
      tournamentId,
      roundId: round.id,
      voterPlayerId: myPlayer.id,
      ballot: ballotToArray(latestBallotRef.current),
      confirmed: confirmArg,
    });
    savingRef.current = false;
    if (res.ok) {
      dirtyRef.current = false;
      setSaveState('saved');
    } else {
      setSaveState('error');
      setSaveError(res.error ?? 'Could not save your ballot.');
    }
    if (pendingRef.current) {
      pendingRef.current = false;
      void runSave();
    }
  }, [locked, tournamentId, round.id, myPlayer.id]);

  const scheduleSave = useCallback(() => {
    if (locked) return;
    dirtyRef.current = true;
    setSaveState('saving');
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void runSave();
    }, 650);
  }, [locked, runSave]);

  // Flush any pending debounce when leaving the page/tab so a walk-away can't
  // drop the last edit.
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        if (dirtyRef.current) void runSave();
      }
    };
  }, [runSave]);

  // Mutating a cell also silently reopens a locked-in ballot (its contents
  // changed), so we thread an explicit unconfirm into the next save.
  const mutate = (targetId: string, next: Cell) => {
    if (locked) return;
    setBallot((cur) => {
      const copy = { ...cur };
      if (next.up <= 0 && next.down <= 0) delete copy[targetId];
      else copy[targetId] = next;
      return copy;
    });
    if (confirmedRef.current) {
      setConfirmed(false);
      confirmedRef.current = false;
      nextConfirmRef.current = false;
    }
    scheduleSave();
  };

  const stepUp = (targetId: string, delta: number) => {
    const cell = ballot[targetId] ?? { up: 0, down: 0 };
    const nextUp = Math.min(upvoteCap, Math.max(0, cell.up + delta));
    if (delta > 0 && left <= 0) return; // no tokens to spend
    if (nextUp === cell.up && cell.down === 0) return;
    mutate(targetId, { up: nextUp, down: 0 });
  };

  const toggleRatherNot = (targetId: string) => {
    const cell = ballot[targetId] ?? { up: 0, down: 0 };
    if (cell.down > 0) mutate(targetId, { up: 0, down: 0 });
    else {
      if (left <= 0 && cell.up === 0) return;
      mutate(targetId, { up: 0, down: 1 });
    }
  };

  const lockIn = useCallback(() => {
    if (locked) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    setConfirmed(true);
    confirmedRef.current = true;
    nextConfirmRef.current = true;
    dirtyRef.current = true;
    void runSave();
  }, [locked, runSave]);

  const reopen = useCallback(() => {
    if (locked) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    setConfirmed(false);
    confirmedRef.current = false;
    nextConfirmRef.current = false;
    dirtyRef.current = true;
    void runSave();
  }, [locked, runSave]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.localStorage.getItem('tp_mixer_howto_seen') !== '1') setShowHow(true);
  }, []);

  const closeHow = () => {
    window.localStorage.setItem('tp_mixer_howto_seen', '1');
    setShowHow(false);
  };

  const optimisticVotes: VoteRow[] = useMemo(() => {
    const others = votes.filter((v) => v.round_id !== round.id);
    const mine = ballotToArray(ballot).map((v) => ({
      round_id: round.id,
      target_player_id: v.target_player_id,
      up_tokens: v.up_tokens,
      down_tokens: v.down_tokens,
    }));
    return [...others, ...mine];
  }, [votes, ballot, round.id]);

  const activeVotes = optimisticVotes.filter((v) => v.round_id === round.id);

  return (
    <div className="px-[18px] lg:px-0">
      {showHow && <FirstVoteCoach budget={budget} rounds={eventRoundCount} onClose={closeHow} />}
      <RoundSelector
        tournamentId={tournamentId}
        rounds={rounds}
        activeRound={round}
        eventRoundCount={eventRoundCount}
        votes={optimisticVotes}
      />

      {/* header — serif ask + blind note (player.html) */}
      <div
        className="mb-3 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-2xl p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto]"
        style={{ background: 'linear-gradient(120deg, color-mix(in oklch, var(--sky) 12%, var(--night-card)), var(--night-card) 65%)', border: `1px solid ${NIGHT_LINE}` }}
      >
        <Dink pose="wave" size={54} />
        <div className="min-w-0">
          <div className="serif text-[24px] leading-[1.05]">
            Who do you want to <em className="italic" style={{ color: 'var(--court)' }}>play with?</em>
          </div>
          <div className="mt-1 text-[12.5px]" style={{ color: NIGHT_TEXT2 }}>
            Spend tokens on the partners you&apos;d love to draw. Stack them to boost your odds.
          </div>
        </div>
        <div
          className="hidden max-w-[220px] items-center gap-2 rounded-xl px-3 py-2 text-[11.5px] sm:flex"
          style={{ border: `1px dashed ${NIGHT_LINE}`, color: NIGHT_TEXT2 }}
        >
          <span aria-hidden style={{ color: 'var(--court)' }}>{Icons.spark}</span>
          Blind — no one sees your picks, not even the organizer.
        </div>
      </div>

      <BallotScopeNote genderMode={genderMode} selfGender={myPlayer.gender} targetCount={targets.length} />

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start lg:gap-4">
        {/* LEFT — budget + candidate cards */}
        <div className="min-w-0">
          <div className="sticky top-0 z-10 mb-3 grid grid-cols-[1fr_auto] items-center gap-3 rounded-2xl p-4" style={{ background: 'var(--night-card-glass)', border: `1px solid ${NIGHT_LINE}`, backdropFilter: 'blur(12px)' }}>
            <div className="min-w-0">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] uppercase tracking-[0.08em]" style={{ color: NIGHT_TEXT3 }}>Token budget</div>
                <div className="mono text-[22px] font-bold" style={{ color: 'var(--court)' }}>{left}/{budget}</div>
              </div>
              <TokenMeter left={left} total={budget} />
              {!locked && round.lock_at && (
                <div className="mt-2 flex items-center gap-2 text-[12.5px] font-semibold" style={{ color: 'var(--serve)' }}>
                  <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full" style={{ background: 'var(--serve)' }} />
                  <span>Voting closes in</span>
                  <CountdownTimer lockAt={round.lock_at} active={!locked} className="mono" closedLabel="now" />
                </div>
              )}
              <div className="mt-3 flex items-center justify-between gap-3 text-xs leading-5" style={{ color: NIGHT_TEXT2 }}>
                <span>{locked ? 'Ballot is sealed for this round.' : `Spend across all ${eventRoundCount} rounds.`}</span>
                <button type="button" onClick={() => setShowHow(true)} className="shrink-0 rounded-full px-3 py-1 text-[11px] font-bold" style={{ border: `1px solid ${NIGHT_LINE}` }}>
                  How it works
                </button>
              </div>
            </div>
            <Dink pose="token-t" size={78} />
          </div>

          {locked && (
            <div
              className="mb-3 grid grid-cols-[auto_1fr] items-center gap-3 rounded-2xl p-3 text-sm"
              style={{
                background: NIGHT_CARD,
                color: NIGHT_TEXT2,
                border: `1px solid ${roundSpent > 0 ? 'color-mix(in oklch, var(--court) 45%, var(--night-line))' : NIGHT_LINE}`,
              }}
            >
              <Dink pose="presenting-t" size={58} />
              <div>
                <div className="font-bold" style={{ color: 'var(--night-text)' }}>
                  {roundSpent > 0 ? 'Your picks are in' : 'Voting closed for this round'}
                </div>
                <div className="mt-1 text-xs leading-5">
                  {roundSpent > 0
                    ? 'Voting is locked. Your choices are sealed; no raw tallies are exposed.'
                    : "Voting is locked and you didn't spend any tokens — the draw will pair you at random."}
                </div>
              </div>
            </div>
          )}

          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {targets.map((p) => {
              const cell = ballot[p.id] ?? { up: 0, down: 0 };
              return (
                <CandidateCard
                  key={p.id}
                  player={p}
                  selfId={myPlayer.id}
                  up={cell.up}
                  down={cell.down}
                  locked={locked}
                  left={left}
                  atCap={cell.up >= upvoteCap}
                  downvotesEnabled={config.downvotes_enabled}
                  onDec={() => stepUp(p.id, -1)}
                  onInc={() => stepUp(p.id, +1)}
                  onRatherNot={() => toggleRatherNot(p.id)}
                />
              );
            })}
          </div>
        </div>

        {/* RIGHT — ballot summary + fairness (desktop rail; stacks below on mobile) */}
        <aside className="mt-4 grid gap-3 lg:sticky lg:top-4 lg:mt-0">
          <div className="rounded-2xl p-4" style={{ background: NIGHT_CARD, border: `1px solid ${NIGHT_LINE}` }}>
            <div className="flex items-center justify-between">
              <div className="text-[14px] font-bold">Your ballot</div>
              <span className="mono rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.08em]" style={{ border: `1px solid ${NIGHT_LINE}`, color: NIGHT_TEXT3 }}>
                Round {round.round_no}
              </span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full" style={{ background: 'var(--night-inset)' }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${budget ? Math.min(100, Math.round((totalSpent / budget) * 100)) : 0}%`, background: 'linear-gradient(90deg, var(--court), var(--serve))' }} />
            </div>
            <div className="mono mt-1.5 flex justify-between text-[11px]" style={{ color: NIGHT_TEXT3 }}>
              <span>{roundSpent} on this round · {totalSpent} spent</span>
              <span>{left} left</span>
            </div>
            <div className="mt-3 grid gap-1.5">
              {activeVotes.length === 0 && (
                <div className="text-[12.5px]" style={{ color: NIGHT_TEXT3 }}>
                  {locked ? 'No tokens spent this round.' : 'No tokens on anyone yet — tap ＋ on a player.'}
                </div>
              )}
              {activeVotes.map((v) => (
                <div key={v.target_player_id} className="flex items-center justify-between gap-2 text-[13px]">
                  <span className="truncate">{nameOf(v.target_player_id)}</span>
                  {v.up_tokens > 0 ? (
                    <span className="mono font-bold" style={{ color: 'var(--court)' }}>+{v.up_tokens}</span>
                  ) : (
                    <span className="mono font-bold" style={{ color: 'var(--night-down-num)' }}>−{v.down_tokens}</span>
                  )}
                </div>
              ))}
            </div>

            {!locked && (
              <BallotConfirm
                confirmed={confirmed}
                saveState={saveState}
                saveError={saveError}
                roundSpent={roundSpent}
                onLockIn={lockIn}
                onReopen={reopen}
              />
            )}
          </div>

          <FairnessCard config={config} />

          <div className="mono rounded-2xl px-4 py-3 text-[11px] leading-5" style={{ border: `1px dashed ${NIGHT_LINE}`, color: NIGHT_TEXT3 }}>
            🔒 Set a ballot per round — all {eventRoundCount} lock together.
          </div>
        </aside>
      </div>

      {/* Mobile confirm bar — sticky above the tab bar so "done" is always reachable */}
      {!locked && (
        <MobileConfirmBar
          confirmed={confirmed}
          saveState={saveState}
          saveError={saveError}
          roundSpent={roundSpent}
          left={left}
          onLockIn={lockIn}
          onReopen={reopen}
        />
      )}
    </div>
  );
}

function saveLabel(saveState: SaveState, saveError: string | null): { text: string; color: string } {
  switch (saveState) {
    case 'saving':
      return { text: 'Saving…', color: NIGHT_TEXT3 };
    case 'saved':
      return { text: 'Saved ✓', color: 'var(--court)' };
    case 'error':
      return { text: saveError ?? 'Save failed', color: 'var(--amber)' };
    default:
      return { text: '', color: NIGHT_TEXT3 };
  }
}

// Desktop rail confirm block: save status + "Lock in my ballot" / locked-in
// state with an edit affordance. Auto-save means picks are already safe; this
// is closure, not the only path to persistence.
function BallotConfirm({
  confirmed,
  saveState,
  saveError,
  roundSpent,
  onLockIn,
  onReopen,
}: {
  confirmed: boolean;
  saveState: SaveState;
  saveError: string | null;
  roundSpent: number;
  onLockIn: () => void;
  onReopen: () => void;
}) {
  const status = saveLabel(saveState, saveError);
  return (
    <div className="mt-4 border-t pt-3" style={{ borderColor: NIGHT_LINE }}>
      {confirmed ? (
        <div className="grid gap-2">
          <div className="flex items-center gap-2 text-[13px] font-bold" style={{ color: 'var(--court)' }}>
            <span aria-hidden>{Icons.spark}</span> Ballot locked in
          </div>
          <div className="text-[11.5px]" style={{ color: NIGHT_TEXT3 }}>
            Saved and ready for the draw. You can still change it until voting closes.
          </div>
          <button type="button" onClick={onReopen} className="rounded-xl px-3 py-2 text-[12.5px] font-semibold" style={{ border: `1px solid ${NIGHT_LINE}`, color: 'var(--night-text)' }}>
            Edit ballot
          </button>
        </div>
      ) : (
        <div className="grid gap-2">
          <button
            type="button"
            onClick={onLockIn}
            className="rounded-xl px-3 py-2.5 text-[13px] font-extrabold disabled:opacity-45"
            style={{ background: 'var(--court)', color: 'var(--night-court-ink)' }}
          >
            {roundSpent > 0 ? 'Lock in my ballot' : "Lock in — I'm sitting this round out"}
          </button>
          <div className="min-h-[16px] text-center text-[11px]" style={{ color: status.color }}>{status.text}</div>
        </div>
      )}
    </div>
  );
}

// Mobile: a sticky action bar just above the bottom tab bar, so the confirm
// button and save status are reachable without scrolling to the desktop rail.
function MobileConfirmBar({
  confirmed,
  saveState,
  saveError,
  roundSpent,
  left,
  onLockIn,
  onReopen,
}: {
  confirmed: boolean;
  saveState: SaveState;
  saveError: string | null;
  roundSpent: number;
  left: number;
  onLockIn: () => void;
  onReopen: () => void;
}) {
  const status = saveLabel(saveState, saveError);
  return (
    <div
      className="fixed inset-x-0 bottom-[68px] z-20 mx-auto flex max-w-md items-center gap-3 px-3 py-2.5 lg:hidden"
      style={{ background: 'var(--night-card-glass)', borderTop: `1px solid ${NIGHT_LINE}`, backdropFilter: 'blur(12px)' }}
    >
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-bold" style={{ color: confirmed ? 'var(--court)' : 'var(--night-text)' }}>
          {confirmed ? 'Ballot locked in ✓' : `${roundSpent} spent · ${left} left`}
        </div>
        <div className="min-h-[14px] text-[10.5px]" style={{ color: status.color }}>{status.text}</div>
      </div>
      {confirmed ? (
        <button type="button" onClick={onReopen} className="shrink-0 rounded-xl px-4 py-2.5 text-[13px] font-semibold" style={{ border: `1px solid ${NIGHT_LINE}`, color: 'var(--night-text)' }}>
          Edit
        </button>
      ) : (
        <button type="button" onClick={onLockIn} className="shrink-0 rounded-xl px-4 py-2.5 text-[13px] font-extrabold" style={{ background: 'var(--court)', color: 'var(--night-court-ink)' }}>
          {roundSpent > 0 ? 'Lock in' : 'Sit out'}
        </button>
      )}
    </div>
  );
}

// Candidate card (player.html): avatar + name + DUPR, − n ＋ stepper, and a
// "rather not" toggle. Green ring when boosted, muted berry when avoided.
// Steppers are local (no per-tap round-trip); the parent batches the write.
function CandidateCard({
  player,
  selfId,
  up,
  down,
  locked,
  left,
  atCap,
  downvotesEnabled,
  onDec,
  onInc,
  onRatherNot,
}: {
  player: PlayerRow;
  selfId: string;
  up: number;
  down: number;
  locked: boolean;
  left: number;
  atCap: boolean;
  downvotesEnabled: boolean;
  onDec: () => void;
  onInc: () => void;
  onRatherNot: () => void;
}) {
  const boosted = up > 0;
  const avoided = down > 0;
  const stepBtn = 'grid h-9 w-9 place-items-center rounded-[10px] text-[18px] font-bold disabled:opacity-35';

  return (
    <div
      className="rounded-2xl p-3.5 transition"
      style={{
        background: boosted ? 'color-mix(in oklch, var(--court) 10%, var(--night-card))' : NIGHT_CARD,
        border: boosted
          ? '1.5px solid color-mix(in oklch, var(--court) 60%, var(--night-line))'
          : avoided
            ? '1.5px solid color-mix(in oklch, var(--night-down) 55%, var(--night-line))'
            : `1px solid ${NIGHT_LINE}`,
        opacity: avoided ? 0.75 : 1,
      }}
    >
      <div className="flex items-center gap-3">
        <Avatar player={mixerAvatarFor(player, selfId)} size={44} ring={boosted} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-bold">{player.display_name}</div>
          <div className="mono text-[11px]" style={{ color: NIGHT_TEXT3 }}>{player.dupr != null ? `${Number(player.dupr).toFixed(2)} DUPR` : 'DUPR —'}</div>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button type="button" onClick={onDec} disabled={locked || up === 0} aria-label={`Remove a token from ${player.display_name}`} className={stepBtn} style={{ border: `1px solid ${NIGHT_LINE}`, color: 'var(--night-text)' }}>
          −
        </button>
        <div className="mono min-w-9 text-center text-[17px] font-bold" style={{ color: boosted ? 'var(--court)' : NIGHT_TEXT3 }}>
          {up}
        </div>
        <button
          type="button"
          onClick={onInc}
          disabled={locked || atCap || left <= 0}
          aria-label={atCap ? `At the ${up}-token cap for ${player.display_name}` : `Add a token to ${player.display_name}`}
          title={atCap ? 'Per-player token cap reached' : undefined}
          className={stepBtn}
          style={{ background: 'color-mix(in oklch, var(--court) 16%, transparent)', border: '1px solid color-mix(in oklch, var(--court) 45%, transparent)', color: 'var(--court)' }}
        >
          ＋
        </button>
        <div className="flex-1" />
        {downvotesEnabled && (
          <button
            type="button"
            onClick={onRatherNot}
            disabled={locked || (!avoided && left <= 0 && up === 0)}
            className="rounded-full px-3 py-1.5 text-[11.5px] font-semibold disabled:opacity-40"
            style={
              avoided
                ? { background: 'color-mix(in oklch, var(--night-down) 20%, transparent)', color: 'var(--night-down-text)', border: '1px solid color-mix(in oklch, var(--night-down) 50%, transparent)' }
                : { color: NIGHT_TEXT3, border: `1px solid ${NIGHT_LINE}` }
            }
          >
            {avoided ? '✓ rather not' : 'rather not'}
          </button>
        )}
      </div>
    </div>
  );
}

// Ballot scope note — in gender-constrained draws (mixed/same) the ballot only
// shows the partners you can actually be paired with, which surprises players
// ("why only women?"). Name the rule, show how they're marked, and point at the
// fix so a wrong/missing gender is self-service rather than a silent mystery.
function BallotScopeNote({
  genderMode,
  selfGender,
  targetCount,
}: {
  genderMode: string;
  selfGender: 'm' | 'f' | 'x' | null;
  targetCount: number;
}) {
  const mode = genderMode === 'same' || genderMode === 'open' ? genderMode : 'mixed';
  if (mode === 'open') return null; // gender doesn't constrain an open draw
  const selfLabel =
    selfGender === 'f' ? 'a woman' : selfGender === 'm' ? 'a man' : selfGender === 'x' ? 'nonbinary' : null;
  const headline = mode === 'mixed' ? 'This is a mixed draw' : 'This is a same-gender draw';
  const body =
    mode === 'mixed'
      ? 'Your ballot only shows partners on the other side of the draw — the people you could actually be paired with.'
      : 'Your ballot only shows players in your own group — the people you could actually be paired with.';
  return (
    <div
      className="mb-3 flex items-start gap-2.5 rounded-2xl px-3.5 py-3 text-[12.5px] leading-[1.5]"
      style={{ background: 'color-mix(in oklch, var(--sky) 10%, transparent)', border: '1px solid color-mix(in oklch, var(--sky) 30%, transparent)', color: NIGHT_TEXT2 }}
    >
      <span aria-hidden style={{ color: 'var(--sky)' }}>{Icons.spark}</span>
      <div>
        <span className="font-bold" style={{ color: 'var(--night-text)' }}>{headline}.</span>{' '}
        {body}{' '}
        {selfLabel ? (
          <>You&apos;re marked as <span className="font-semibold">{selfLabel}</span>. Wrong? Ask your organizer to update your gender in the roster.</>
        ) : (
          <span style={{ color: 'var(--amber)' }}>Your gender isn&apos;t set, so you&apos;ve been placed by default — ask your organizer to set it so you see the right partners.</span>
        )}
        {targetCount === 0 && ' (No eligible partners yet — the roster may still be filling up.)'}
      </div>
    </div>
  );
}

// "How the draw works" — plain-language fairness card (ux-activation.html):
// the event's actual weighting plus the no-peeking guarantee.
function FairnessCard({ config }: { config: ConfigRow }) {
  const a = Math.max(0, config.alpha ?? 1);
  const b = Math.max(0, config.beta ?? 2.5);
  const g = Math.max(0, config.gamma ?? 1);
  const total = a + b + g || 1;
  const pct = (x: number) => Math.round((x / total) * 100);
  const segs: Array<[string, number, string]> = [
    ['Votes', pct(a), 'var(--court)'],
    ['Skill', pct(b), 'var(--sky)'],
    ['Novelty', Math.max(0, 100 - pct(a) - pct(b)), 'var(--serve)'],
  ];
  return (
    <div className="rounded-2xl p-4" style={{ background: NIGHT_CARD, border: `1px solid ${NIGHT_LINE}` }}>
      <div className="text-[14px] font-bold">How the draw works</div>
      <div className="mt-1.5 text-[12px] leading-[1.5]" style={{ color: NIGHT_TEXT2 }}>
        Every round, all tokens go into one weighted draw. More tokens on someone = better odds you&apos;re paired.
      </div>
      <div className="mt-3 flex h-2.5 overflow-hidden rounded-full">
        {segs.map(([label, w, color]) => (
          <div key={label} style={{ width: `${w}%`, background: color }} />
        ))}
      </div>
      <div className="mono mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10.5px]" style={{ color: NIGHT_TEXT3 }}>
        {segs.map(([label, w, color]) => (
          <span key={label} className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: color }} />
            {w}% {label.toLowerCase()}
          </span>
        ))}
      </div>
      <div className="mt-3 rounded-xl px-3 py-2 text-[11.5px] leading-[1.45]" style={{ background: 'color-mix(in oklch, var(--sky) 10%, transparent)', border: '1px solid color-mix(in oklch, var(--sky) 30%, transparent)', color: NIGHT_TEXT2 }}>
        Nobody can peek or tip the scales — picks stay hidden from players and the organizer until the draw runs.
      </div>
    </div>
  );
}

function RoundSelector({
  tournamentId,
  rounds,
  activeRound,
  eventRoundCount,
  votes,
}: {
  tournamentId: string;
  rounds: RoundRow[];
  activeRound: RoundRow;
  eventRoundCount: number;
  votes: VoteRow[];
}) {
  const byNumber = new Map(rounds.map((round) => [round.round_no, round]));
  const total = Math.max(eventRoundCount, rounds.length, activeRound.round_no);
  // Per-round status → dot + state-colored meta label (handoff round strip,
  // player.html .rs states): voting-now (serve) · set/played (court-deep) ·
  // not-set (grey). The meta label carries its own state colour instead of a
  // flat grey.
  const statusOf = (round: RoundRow | undefined, spent: number) => {
    if (!round) return { kind: 'notset' as const, dot: 'var(--night-line-2)', meta: NIGHT_TEXT3, label: 'Pending' };
    if (round.state === 'open') return { kind: 'voting' as const, dot: 'var(--serve)', meta: 'var(--serve)', label: 'Voting now' };
    const played = ['playing', 'done'].includes(round.state);
    const closed = played || ['locked', 'revealed'].includes(round.state);
    // Green only when THIS player actually set a ballot; a closed round they
    // skipped is amber "No ballot" so an abstained round never masquerades as
    // a submitted one.
    if (spent > 0) return { kind: 'set' as const, dot: 'var(--court)', meta: 'var(--court-deep)', label: played ? 'Set · played' : 'Set' };
    if (closed) return { kind: 'set' as const, dot: 'var(--amber)', meta: 'var(--amber)', label: played ? 'Played · no ballot' : 'No ballot' };
    return { kind: 'notset' as const, dot: 'var(--night-line-2)', meta: NIGHT_TEXT3, label: 'Not set' };
  };
  return (
    <div className="mb-3">
      <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.1em]" style={{ color: NIGHT_TEXT3 }}>
        Ballot for
        <span className="mono font-bold" style={{ color: 'var(--court)' }}>Round {activeRound.round_no}</span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {Array.from({ length: total }).map((_, index) => {
          const roundNo = index + 1;
          const round = byNumber.get(roundNo);
          const active = round?.id === activeRound.id;
          const spent = round ? votes.filter((vote) => vote.round_id === round.id).reduce((sum, vote) => sum + vote.up_tokens + vote.down_tokens, 0) : 0;
          const status = statusOf(round, spent);
          const inner = (
            <>
              <span className="text-sm font-bold" style={{ color: 'var(--night-text)' }}>Round {roundNo}</span>
              <span
                className="mt-1 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.06em]"
                style={{ color: status.meta }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: status.dot }} />
                {status.label}
              </span>
            </>
          );
          // Active tab = accent border + soft 12% tint (handoff .rs.on), not a
          // solid fill — so the state dot/label stay readable on the current tab.
          const style = {
            minWidth: 118,
            background: active ? 'color-mix(in oklch, var(--court) 12%, transparent)' : NIGHT_CARD,
            border: active
              ? '1.5px solid var(--court)'
              : `1.5px solid ${status.kind === 'voting' ? 'color-mix(in oklch, var(--serve) 40%, var(--night-line))' : NIGHT_LINE}`,
          };
          if (!round) {
            return (
              <span key={roundNo} className="flex flex-1 flex-col items-start rounded-xl px-3.5 py-2.5 opacity-50" style={style}>
                {inner}
              </span>
            );
          }
          return (
            <Link
              key={round.id}
              href={`/tournaments/${tournamentId}/mixer?round=${round.round_no}`}
              className="flex flex-1 flex-col items-start rounded-xl px-3.5 py-2.5"
              style={style}
            >
              {inner}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// First-run coach (ux-activation.html UX1·a): one card, three plain-language
// points, then "Cast my first vote". Centered and desktop-safe.
function FirstVoteCoach({ budget, rounds, onClose }: { budget: number; rounds: number; onClose: () => void }) {
  const points: Array<[string, string]> = [
    ['Spend tokens on people you want', `You've got ${budget} for the night. Stack more on a favourite to boost your odds.`],
    ['Nobody sees your picks', 'Not other players. Not even the organizer. It stays blind until the draw.'],
    ['The draw does the rest', `Tokens become teams live on the big screen, round by round for all ${rounds} rounds.`],
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5" style={{ background: 'var(--night-scrim)' }}>
      <div className="relative w-full max-w-[420px] rounded-[22px] p-6" style={{ background: NIGHT_CARD, border: `1px solid ${NIGHT_LINE}` }}>
        <button type="button" onClick={onClose} aria-label="Close" className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'var(--night-inset)', color: NIGHT_TEXT2 }}>
          {Icons.close}
        </button>
        <Dink pose="wave" size={104} />
        <div className="serif mt-2 text-center text-[34px] leading-none">
          Your first <em className="italic" style={{ color: 'var(--court)' }}>vote.</em>
        </div>
        <div className="mt-1.5 text-center text-[13px]" style={{ color: NIGHT_TEXT2 }}>Three things and you&apos;re a pro.</div>
        <div className="mt-5 grid gap-3.5">
          {points.map(([title, body], i) => (
            <div key={title} className="flex items-start gap-3">
              <span className="mono grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[12px] font-bold" style={{ background: 'color-mix(in oklch, var(--court) 16%, transparent)', color: 'var(--court)' }}>
                {i + 1}
              </span>
              <div>
                <div className="text-[14px] font-bold">{title}</div>
                <div className="mt-0.5 text-[12.5px] leading-[1.45]" style={{ color: NIGHT_TEXT2 }}>{body}</div>
              </div>
            </div>
          ))}
        </div>
        <button type="button" onClick={onClose} className="mt-6 w-full rounded-2xl px-5 py-4 text-[15px] font-extrabold" style={{ background: 'var(--court)', color: 'var(--night-court-ink)' }}>
          Cast my first vote
        </button>
      </div>
    </div>
  );
}

function TokenMeter({ left, total }: { left: number; total: number }) {
  return (
    <div className="mt-3 flex flex-wrap gap-1">
      {Array.from({ length: total }).map((_, i) => (
        <TokenDot key={i} active={i < left} />
      ))}
    </div>
  );
}

function TokenDot({ active }: { active: boolean }) {
  return (
    <span
      className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full"
      style={{
        background: active ? 'var(--court)' : 'transparent',
        border: active ? 'none' : '1.5px dashed var(--night-line)',
        boxShadow: active ? 'inset 0 -2px 4px var(--night-court-ink-soft), inset 0 2px 3px rgba(255,255,255,0.25)' : 'none',
      }}
    />
  );
}
