'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Avatar, playerFromName } from '@/components/ui/Avatar';
import { Icons } from '@/components/ui/icons';
import { setMixerVote } from './actions';

type ConfigRow = {
  starting_tokens: number;
  rounds: number;
  downvotes_enabled: boolean;
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
}) {
  const [optimisticVotes, setOptimisticVotes] = useState(votes);
  const [showHow, setShowHow] = useState(false);
  const poolFor = (player: PlayerRow): 'a' | 'b' => (player.gender === 'f' ? 'b' : 'a');
  const myPool = states.find((s) => s.player_id === myPlayer.id)?.pairing_pool ?? poolFor(myPlayer);
  const targets = roster.filter((p) => p.id !== myPlayer.id && poolFor(p) !== myPool);
  const activeVotes = optimisticVotes.filter((v) => v.round_id === round.id);
  const serverSpent = votes.reduce((s, v) => s + v.up_tokens + v.down_tokens, 0);
  const optimisticSpent = optimisticVotes.reduce((s, v) => s + v.up_tokens + v.down_tokens, 0);
  const serverRemaining = (myState?.tokens_base_remaining ?? config.starting_tokens) + (myState?.tokens_bought_remaining ?? 0);
  const budget = Math.max(config.starting_tokens, serverRemaining + serverSpent);
  const left = Math.max(0, budget - optimisticSpent);
  const locked = round.state !== 'open' || (round.lock_at ? new Date(round.lock_at).getTime() <= Date.now() : false);

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
    <div className="px-[18px]">
      {showHow && <HowItWorks budget={budget} rounds={eventRoundCount} onClose={closeHow} />}
      <RoundSelector
        tournamentId={tournamentId}
        rounds={rounds}
        activeRound={round}
        eventRoundCount={eventRoundCount}
        votes={optimisticVotes}
      />
      <div
        className="mb-3 flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs"
        style={{ background: 'oklch(0.215 0.03 264)', border: '1px dashed oklch(0.42 0.045 266)', color: 'oklch(0.78 0.028 264)' }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--court)', flexShrink: 0 }} aria-hidden>
          <path d="M4 4l16 16M9.5 9.6A2.6 2.6 0 0012 14.6M6.2 6.7C3.9 8.2 2.5 12 2.5 12s3.5 6.5 9.5 6.5c1.6 0 3-.45 4.2-1.1M10 5.8c.65-.13 1.3-.2 2-.2 6 0 9.5 6.4 9.5 6.4a17 17 0 01-2.3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <span>Blind ballot — no one sees your picks, <b style={{ color: 'oklch(0.975 0.012 264)' }}>not even the admin</b>.</span>
      </div>
      <div className="sticky top-0 z-10 mb-3 grid grid-cols-[1fr_auto] items-center gap-3 rounded-2xl p-4" style={{ background: 'oklch(0.215 0.03 264 / 0.96)', border: '1px solid oklch(0.36 0.04 266)', backdropFilter: 'blur(12px)' }}>
        <div className="min-w-0">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[11px] uppercase tracking-[0.08em]" style={{ color: 'oklch(0.7 0.03 264)' }}>Token budget</div>
            <div className="mono text-[22px] font-bold" style={{ color: 'var(--court)' }}>{left}/{budget}</div>
          </div>
          <TokenMeter left={left} total={budget} />
          <div className="mt-3 flex items-center justify-between gap-3 text-xs leading-5" style={{ color: 'oklch(0.78 0.028 264)' }}>
            <span>{locked ? 'Ballot is sealed for this round.' : `Spend across all ${eventRoundCount} rounds.`}</span>
            <button type="button" onClick={() => setShowHow(true)} className="shrink-0 rounded-full px-3 py-1 text-[11px] font-bold" style={{ border: '1px solid oklch(0.36 0.04 266)' }}>
              How it works
            </button>
          </div>
        </div>
        <Dink pose="token-t" size={78} />
      </div>
      {locked && (
        <div className="mb-3 grid grid-cols-[auto_1fr] items-center gap-3 rounded-2xl p-3 text-sm" style={{ background: 'oklch(0.215 0.03 264)', color: 'oklch(0.78 0.028 264)', border: '1px solid oklch(0.36 0.04 266)' }}>
          <Dink pose="presenting-t" size={58} />
          <div>
            <div className="font-bold" style={{ color: 'oklch(0.975 0.012 264)' }}>Your picks are in</div>
            <div className="mt-1 text-xs leading-5">Voting is locked. Your choices are sealed; no raw tallies are exposed.</div>
          </div>
        </div>
      )}
      <div className="grid gap-2.5">
        {targets.map((p) => {
          const vote = activeVotes.find((v) => v.target_player_id === p.id) ?? { up_tokens: 0, down_tokens: 0 };
          const up = vote.up_tokens;
          const down = vote.down_tokens;
          return (
            <div
              key={p.id}
              className="rounded-2xl p-3 transition"
              style={{
                background: up > 0
                  ? 'color-mix(in oklch, var(--court) 10%, oklch(0.215 0.03 264))'
                  : 'oklch(0.215 0.03 264)',
                border: up > 0
                  ? '1px solid color-mix(in oklch, var(--court) 55%, oklch(0.36 0.04 266))'
                  : '1px solid oklch(0.36 0.04 266)',
                opacity: down > 0 ? 0.68 : 1,
              }}
            >
              <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
                <Avatar player={mixerAvatarFor(p, myPlayer.id)} size={48} ring={up > 0} />
                <div className="min-w-0">
                  <div className="truncate text-[16px] font-bold">{p.display_name}</div>
                  <div className="mt-1 flex min-w-0 items-center gap-2">
                    <span className="mono text-[11px]" style={{ color: 'oklch(0.7 0.03 264)' }}>DUPR {p.dupr ?? '-'}</span>
                    {up > 0 && <TokenCount tone="up" count={up} />}
                    {down > 0 && <TokenCount tone="down" count={down} />}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                {(up > 0 || down > 0) && (
                  <VoteSubmit
                    action={submitVote}
                    label="Clear"
                    tournamentId={tournamentId}
                    roundId={round.id}
                    voterPlayerId={myPlayer.id}
                    targetPlayerId={p.id}
                    upTokens={0}
                    downTokens={0}
                    returnRound={round.round_no}
                    disabled={locked}
                    tone="clear"
                  />
                )}
                {config.downvotes_enabled && (
                  <VoteSubmit
                    action={submitVote}
                    label={down > 0 ? `-${down}` : 'No thanks'}
                    tournamentId={tournamentId}
                    roundId={round.id}
                    voterPlayerId={myPlayer.id}
                    targetPlayerId={p.id}
                    upTokens={0}
                    downTokens={down + 1}
                    returnRound={round.round_no}
                    disabled={locked || (left <= 0 && up === 0)}
                    tone="down"
                  />
                )}
                <VoteSubmit
                  action={submitVote}
                  label={up > 0 ? `+${up}` : "Want 'em"}
                  tournamentId={tournamentId}
                  roundId={round.id}
                  voterPlayerId={myPlayer.id}
                  targetPlayerId={p.id}
                  upTokens={up + 1}
                  downTokens={0}
                  returnRound={round.round_no}
                  disabled={locked || (left <= 0 && down === 0)}
                  tone="up"
                />
              </div>
            </div>
          );
        })}
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
    if (!round) return { kind: 'notset' as const, dot: 'oklch(0.42 0.045 266)', label: 'Pending' };
    if (round.state === 'open') return { kind: 'voting' as const, dot: 'var(--serve)', label: 'Voting now' };
    const played = ['playing', 'done'].includes(round.state);
    if (spent > 0 || played || ['locked', 'revealed'].includes(round.state)) {
      return { kind: 'set' as const, dot: 'var(--court)', label: played ? 'Set · played' : 'Set' };
    }
    return { kind: 'notset' as const, dot: 'oklch(0.42 0.045 266)', label: 'Not set' };
  };
  return (
    <div className="mb-3">
      <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.1em]" style={{ color: 'oklch(0.7 0.03 264)' }}>
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
              <span className="text-sm font-bold" style={{ color: active ? 'oklch(0.2 0.04 140)' : 'oklch(0.975 0.012 264)' }}>Round {roundNo}</span>
              <span
                className="mt-1 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.06em]"
                style={{ color: active ? 'oklch(0.2 0.04 140)' : 'oklch(0.78 0.028 264)' }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: active ? 'oklch(0.2 0.04 140)' : status.dot }} />
                {status.label}
              </span>
            </>
          );
          const style = {
            minWidth: 118,
            background: active ? 'var(--court)' : 'oklch(0.215 0.03 264)',
            border: active
              ? '1.5px solid var(--court)'
              : `1.5px solid ${status.kind === 'voting' ? 'color-mix(in oklch, var(--serve) 40%, oklch(0.36 0.04 266))' : 'oklch(0.36 0.04 266)'}`,
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

function VoteSubmit({
  action,
  label,
  tournamentId,
  roundId,
  voterPlayerId,
  targetPlayerId,
  upTokens,
  downTokens,
  returnRound,
  disabled,
  tone,
}: {
  action: (formData: FormData) => Promise<void>;
  label: string;
  tournamentId: string;
  roundId: string;
  voterPlayerId: string;
  targetPlayerId: string;
  upTokens: number;
  downTokens: number;
  returnRound: number;
  disabled: boolean;
  tone: 'up' | 'down' | 'clear';
}) {
  const primary = tone === 'up';
  const negative = tone === 'down';
  return (
    <form action={action} className={primary ? 'ml-auto' : ''}>
      <input type="hidden" name="tournament_id" value={tournamentId} />
      <input type="hidden" name="round_id" value={roundId} />
      <input type="hidden" name="voter_player_id" value={voterPlayerId} />
      <input type="hidden" name="target_player_id" value={targetPlayerId} />
      <input type="hidden" name="up_tokens" value={upTokens} />
      <input type="hidden" name="down_tokens" value={downTokens} />
      <input type="hidden" name="return_round" value={returnRound} />
      <button
        disabled={disabled}
        className="h-10 rounded-xl px-3 text-xs font-extrabold disabled:opacity-40"
        style={{
          minWidth: primary ? 92 : negative ? 78 : 54,
          background: primary
            ? 'var(--court)'
            : negative
              ? 'oklch(0.285 0.038 266)'
              : 'transparent',
          color: primary
            ? 'oklch(0.2 0.04 140)'
            : negative
              ? 'oklch(0.975 0.012 264)'
              : 'oklch(0.7 0.03 264)',
          border: primary ? 'none' : negative ? '1px solid oklch(0.42 0.045 266)' : '1px solid transparent',
        }}
      >
        {label}
      </button>
    </form>
  );
}

function HowItWorks({ budget, rounds, onClose }: { budget: number; rounds: number; onClose: () => void }) {
  const steps = useMemo(() => [
    ['wave', 'Pick your dream partners', "Tap Want 'em on anyone you want beside you. Mutual interest makes that pairing more likely."],
    ['token-t', `${budget} tokens total`, `Spend them across all ${rounds} rounds up front. You can stack tokens or spread them around.`],
    ['presenting-t', 'Then watch the draw', 'When the organizer locks the ballot, Dink reveals one round at a time. Votes stay blind.'],
  ] as const, [budget, rounds]);
  const [index, setIndex] = useState(0);
  const step = steps[index];
  const last = index === steps.length - 1;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: 'oklch(0.155 0.024 264 / 0.94)' }}>
      <button type="button" onClick={onClose} aria-label="Close" className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'oklch(0.285 0.038 266)', color: 'oklch(0.78 0.028 264)' }}>
        {Icons.close}
      </button>
      <div className="max-w-[360px] text-center">
        <Dink pose={step[0]} size={146} />
        <div className="serif mt-4 text-[36px] leading-none">{step[1]}</div>
        <div className="mt-3 text-sm leading-6" style={{ color: 'oklch(0.78 0.028 264)' }}>{step[2]}</div>
        <div className="mt-7 flex justify-center gap-1.5">
          {steps.map((_, i) => <span key={i} className="h-1.5 rounded-full" style={{ width: i === index ? 24 : 7, background: i === index ? 'var(--court)' : 'oklch(0.36 0.04 266)' }} />)}
        </div>
        <button type="button" onClick={() => last ? onClose() : setIndex(index + 1)} className="mt-6 w-full rounded-2xl px-5 py-4 text-sm font-extrabold" style={{ background: 'var(--court)', color: 'oklch(0.2 0.04 140)' }}>
          {last ? "Let's vote" : 'Next'}
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

function TokenDot({ active, tone = 'up' }: { active: boolean; tone?: 'up' | 'down' }) {
  return (
    <span
      className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full"
      style={{
        background: active ? (tone === 'up' ? 'var(--court)' : 'oklch(0.285 0.038 266)') : 'transparent',
        border: active ? 'none' : '1.5px dashed oklch(0.36 0.04 266)',
        boxShadow: active ? 'inset 0 -2px 4px oklch(0.2 0.04 140 / 0.22), inset 0 2px 3px rgba(255,255,255,0.25)' : 'none',
      }}
    />
  );
}

function TokenCount({ count, tone }: { count: number; tone: 'up' | 'down' }) {
  return (
    <span className="inline-flex items-center gap-1">
      {Array.from({ length: Math.min(count, 3) }).map((_, i) => (
        <TokenDot key={i} active tone={tone} />
      ))}
      {count > 3 && <span className="mono text-[11px]" style={{ color: tone === 'up' ? 'var(--court)' : 'oklch(0.78 0.028 264)' }}>+{count - 3}</span>}
    </span>
  );
}

function Dink({ pose, size }: { pose: 'wave' | 'token-t' | 'presenting-t'; size: number }) {
  const file = pose === 'wave' ? 'wave' : pose;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/design-handoff/dink/${file}.png`}
      alt=""
      width={size}
      height={size}
      className="mx-auto shrink-0 object-contain"
      style={{ width: size, height: size }}
    />
  );
}

function mixerAvatarFor(player: PlayerRow, selfId?: string) {
  if (selfId && player.id === selfId) {
    return playerFromName(player.display_name, '/design-handoff/avatars/me.png');
  }
  const n = 2 + (hashString(player.id || player.display_name) % 11);
  return playerFromName(player.display_name, `/design-handoff/avatars/p${n}.png`);
}

function hashString(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}
