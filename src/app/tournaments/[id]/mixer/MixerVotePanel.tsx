'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { Icons } from '@/components/ui/icons';
import { eligibleBallotTargets } from '@/lib/mixer';
import { Dink, mixerAvatarFor } from './_components/mixer-night';
import { setMixerVote } from './actions';

// Player ballot — rebuilt to the handoff player.html spec: candidate cards
// with − n + steppers and a "rather not" toggle, a desktop ballot rail with
// the live allocation summary, and a plain-language "how the draw works"
// fairness card. Votes stay blind; everything here is the caller's own data.

type ConfigRow = {
  starting_tokens: number;
  rounds: number;
  downvotes_enabled: boolean;
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

const NIGHT_CARD = 'var(--night-card)';
const NIGHT_LINE = 'var(--night-line)';
const NIGHT_TEXT2 = 'var(--night-text2)';
const NIGHT_TEXT3 = 'var(--night-text3)';

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
  genderMode?: string;
}) {
  const [optimisticVotes, setOptimisticVotes] = useState(votes);
  const [showHow, setShowHow] = useState(false);
  const myPool = states.find((s) => s.player_id === myPlayer.id)?.pairing_pool;
  // Eligible ballot targets follow the event's gender mode: mixed shows the
  // opposite pool (classic mixer), same shows your own gender, open shows
  // everyone. Mirrors the draw's pairing constraints so players never spend
  // tokens on someone they can't be paired with.
  const targets = eligibleBallotTargets(roster, myPlayer, genderMode, myPool);
  const activeVotes = optimisticVotes.filter((v) => v.round_id === round.id);
  const serverSpent = votes.reduce((s, v) => s + v.up_tokens + v.down_tokens, 0);
  const optimisticSpent = optimisticVotes.reduce((s, v) => s + v.up_tokens + v.down_tokens, 0);
  const roundSpent = activeVotes.reduce((s, v) => s + v.up_tokens + v.down_tokens, 0);
  const serverRemaining = (myState?.tokens_base_remaining ?? config.starting_tokens) + (myState?.tokens_bought_remaining ?? 0);
  const budget = Math.max(config.starting_tokens, serverRemaining + serverSpent);
  const left = Math.max(0, budget - optimisticSpent);
  const locked = round.state !== 'open' || (round.lock_at ? new Date(round.lock_at).getTime() <= Date.now() : false);
  const nameOf = (id: string) => roster.find((p) => p.id === id)?.display_name ?? '—';

  useEffect(() => setOptimisticVotes(votes), [votes]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.localStorage.getItem('tp_mixer_howto_seen') !== '1') setShowHow(true);
  }, []);

  const submitVote = async (formData: FormData) => {
    const targetId = String(formData.get('target_player_id') ?? '');
    const up = Number(formData.get('up_tokens') ?? 0);
    const down = Number(formData.get('down_tokens') ?? 0);
    setOptimisticVotes((current) => {
      const next = current.filter((vote) => !(vote.round_id === round.id && vote.target_player_id === targetId));
      if (up > 0 || down > 0) next.push({ round_id: round.id, target_player_id: targetId, up_tokens: up, down_tokens: down });
      return next;
    });
    await setMixerVote(formData);
  };

  const closeHow = () => {
    window.localStorage.setItem('tp_mixer_howto_seen', '1');
    setShowHow(false);
  };

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
          Blind — no one sees your picks, not even the admin.
        </div>
      </div>

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
            <div className="mb-3 grid grid-cols-[auto_1fr] items-center gap-3 rounded-2xl p-3 text-sm" style={{ background: NIGHT_CARD, color: NIGHT_TEXT2, border: `1px solid ${NIGHT_LINE}` }}>
              <Dink pose="presenting-t" size={58} />
              <div>
                <div className="font-bold" style={{ color: 'var(--night-text)' }}>Your picks are in</div>
                <div className="mt-1 text-xs leading-5">Voting is locked. Your choices are sealed; no raw tallies are exposed.</div>
              </div>
            </div>
          )}

          <div className="grid gap-2.5 sm:grid-cols-2 2xl:grid-cols-3">
            {targets.map((p) => {
              const vote = activeVotes.find((v) => v.target_player_id === p.id) ?? { up_tokens: 0, down_tokens: 0 };
              return (
                <CandidateCard
                  key={p.id}
                  player={p}
                  selfId={myPlayer.id}
                  up={vote.up_tokens}
                  down={vote.down_tokens}
                  locked={locked}
                  left={left}
                  downvotesEnabled={config.downvotes_enabled}
                  tournamentId={tournamentId}
                  roundId={round.id}
                  voterPlayerId={myPlayer.id}
                  returnRound={round.round_no}
                  action={submitVote}
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
              <div className="h-full rounded-full transition-all" style={{ width: `${budget ? Math.min(100, Math.round((optimisticSpent / budget) * 100)) : 0}%`, background: 'linear-gradient(90deg, var(--court), var(--serve))' }} />
            </div>
            <div className="mono mt-1.5 flex justify-between text-[11px]" style={{ color: NIGHT_TEXT3 }}>
              <span>{roundSpent} on this round · {optimisticSpent} spent</span>
              <span>{left} left</span>
            </div>
            <div className="mt-3 grid gap-1.5">
              {activeVotes.length === 0 && (
                <div className="text-[12.5px]" style={{ color: NIGHT_TEXT3 }}>No tokens on anyone yet — tap ＋ on a player.</div>
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
          </div>

          <FairnessCard config={config} />

          <div className="mono rounded-2xl px-4 py-3 text-[11px] leading-5" style={{ border: `1px dashed ${NIGHT_LINE}`, color: NIGHT_TEXT3 }}>
            🔒 Set a ballot per round — all {eventRoundCount} lock together.
          </div>
        </aside>
      </div>
    </div>
  );
}

// Candidate card (player.html): avatar + name + DUPR, − n ＋ stepper, and a
// "rather not" toggle. Green ring when boosted, muted berry when avoided.
function CandidateCard({
  player,
  selfId,
  up,
  down,
  locked,
  left,
  downvotesEnabled,
  tournamentId,
  roundId,
  voterPlayerId,
  returnRound,
  action,
}: {
  player: PlayerRow;
  selfId: string;
  up: number;
  down: number;
  locked: boolean;
  left: number;
  downvotesEnabled: boolean;
  tournamentId: string;
  roundId: string;
  voterPlayerId: string;
  returnRound: number;
  action: (formData: FormData) => Promise<void>;
}) {
  const boosted = up > 0;
  const avoided = down > 0;
  const hidden = (upTokens: number, downTokens: number) => (
    <>
      <input type="hidden" name="tournament_id" value={tournamentId} />
      <input type="hidden" name="round_id" value={roundId} />
      <input type="hidden" name="voter_player_id" value={voterPlayerId} />
      <input type="hidden" name="target_player_id" value={player.id} />
      <input type="hidden" name="up_tokens" value={upTokens} />
      <input type="hidden" name="down_tokens" value={downTokens} />
      <input type="hidden" name="return_round" value={returnRound} />
    </>
  );
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
        <form action={action}>
          {hidden(Math.max(0, up - 1), 0)}
          <button disabled={locked || up === 0} aria-label={`Remove a token from ${player.display_name}`} className={stepBtn} style={{ border: `1px solid ${NIGHT_LINE}`, color: 'var(--night-text)' }}>
            −
          </button>
        </form>
        <div className="mono min-w-9 text-center text-[17px] font-bold" style={{ color: boosted ? 'var(--court)' : NIGHT_TEXT3 }}>
          {up}
        </div>
        <form action={action}>
          {hidden(up + 1, 0)}
          <button
            disabled={locked || left <= 0}
            aria-label={`Add a token to ${player.display_name}`}
            className={stepBtn}
            style={{ background: 'color-mix(in oklch, var(--court) 16%, transparent)', border: '1px solid color-mix(in oklch, var(--court) 45%, transparent)', color: 'var(--court)' }}
          >
            ＋
          </button>
        </form>
        <div className="flex-1" />
        {downvotesEnabled && (
          <form action={action}>
            {hidden(0, avoided ? 0 : 1)}
            <button
              disabled={locked || (!avoided && left <= 0 && up === 0)}
              className="rounded-full px-3 py-1.5 text-[11.5px] font-semibold"
              style={
                avoided
                  ? { background: 'color-mix(in oklch, var(--night-down) 20%, transparent)', color: 'var(--night-down-text)', border: '1px solid color-mix(in oklch, var(--night-down) 50%, transparent)' }
                  : { color: NIGHT_TEXT3, border: `1px solid ${NIGHT_LINE}` }
              }
            >
              {avoided ? '✓ rather not' : 'rather not'}
            </button>
          </form>
        )}
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
  // Per-round status → dot + label (handoff round strip):
  //   voting-now (serve) · set/played (accent) · not-set (grey)
  const statusOf = (round: RoundRow | undefined, spent: number) => {
    if (!round) return { kind: 'notset' as const, dot: 'var(--night-line-2)', label: 'Pending' };
    if (round.state === 'open') return { kind: 'voting' as const, dot: 'var(--serve)', label: 'Voting now' };
    const played = ['playing', 'done'].includes(round.state);
    if (spent > 0 || played || ['locked', 'revealed'].includes(round.state)) {
      return { kind: 'set' as const, dot: 'var(--court)', label: played ? 'Set · played' : 'Set' };
    }
    return { kind: 'notset' as const, dot: 'var(--night-line-2)', label: 'Not set' };
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
              <span className="text-sm font-bold" style={{ color: active ? 'var(--night-court-ink)' : 'var(--night-text)' }}>Round {roundNo}</span>
              <span
                className="mt-1 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.06em]"
                style={{ color: active ? 'var(--night-court-ink)' : NIGHT_TEXT2 }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: active ? 'var(--night-court-ink)' : status.dot }} />
                {status.label}
              </span>
            </>
          );
          const style = {
            minWidth: 118,
            background: active ? 'var(--court)' : NIGHT_CARD,
            border: active
              ? '1.5px solid var(--court)'
              : `1.5px solid ${status.kind === 'voting' ? 'color-mix(in oklch, var(--serve) 40%, var(--night-line))' : NIGHT_LINE}`,
          };
          if (!round) {
            return (
              <span key={roundNo} className="flex flex-col items-start rounded-xl px-3.5 py-2.5 opacity-50" style={style}>
                {inner}
              </span>
            );
          }
          return (
            <Link
              key={round.id}
              href={`/tournaments/${tournamentId}/mixer?round=${round.round_no}`}
              className="flex flex-col items-start rounded-xl px-3.5 py-2.5"
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



