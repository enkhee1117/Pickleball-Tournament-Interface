import { Avatar, type AvatarPlayer } from '@/components/ui/Avatar';
import { Chip } from '@/components/ui/Chip';
import { Icons } from '@/components/ui/icons';

export type MatchStatus = 'live' | 'final' | 'upcoming';

export type MatchCardData = {
  court: number | string;
  round?: number | string;
  status: MatchStatus;
  teamA: [AvatarPlayer, AvatarPlayer];
  teamB: [AvatarPlayer, AvatarPlayer];
  scoreA: number;
  scoreB: number;
};

export function MatchCard({ data }: { data: MatchCardData }) {
  const { court, status, teamA, teamB, scoreA, scoreB } = data;
  const isLive = status === 'live';
  const isDone = status === 'final';
  const aWins = scoreA > scoreB;

  return (
    <div
      className="relative overflow-hidden rounded-2xl bg-white p-3"
      style={{
        border: isLive ? undefined : '1px solid var(--line)',
        borderTop: '1px solid var(--line)',
        borderRight: '1px solid var(--line)',
        borderBottom: '1px solid var(--line)',
        borderLeft: isLive ? '3px solid var(--serve)' : '1px solid var(--line)',
      }}
    >
      <div className="mb-2.5 flex items-center justify-between">
        <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-2">COURT {court}</div>
        {isLive && <Chip tone="live">LIVE</Chip>}
        {isDone && <Chip tone="court">FINAL</Chip>}
        {status === 'upcoming' && <Chip tone="ghost">UP NEXT</Chip>}
      </div>
      <TeamLine players={teamA} score={scoreA} winning={isDone && aWins} live={isLive && aWins} />
      <div className="my-1.5 h-px" style={{ background: 'var(--line)' }} />
      <TeamLine players={teamB} score={scoreB} winning={isDone && !aWins} live={isLive && !aWins} />
    </div>
  );
}

function TeamLine({
  players,
  score,
  winning,
  live,
}: {
  players: [AvatarPlayer, AvatarPlayer];
  score: number;
  winning?: boolean;
  live?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5 px-0.5 py-1">
      <div className="flex">
        <Avatar player={players[0]} size={26} />
        <div className="-ml-2">
          <Avatar player={players[1]} size={26} />
        </div>
      </div>
      <div
        className="min-w-0 flex-1 text-[13px]"
        style={{ fontWeight: winning ? 600 : 500, color: winning ? 'var(--ink)' : 'var(--ink-2)' }}
      >
        {firstName(players[0]?.name)} & {firstName(players[1]?.name)}
      </div>
      {winning && <span style={{ color: 'var(--court-deep)' }}>{Icons.check}</span>}
      <div
        className="mono min-w-[32px] text-right text-[22px] font-bold tracking-tight"
        style={{
          color: winning ? 'var(--court-deep)' : live ? 'var(--serve)' : 'var(--ink-3)',
          letterSpacing: '-0.02em',
        }}
      >
        {score}
      </div>
    </div>
  );
}

function firstName(name?: string): string {
  if (!name) return '—';
  return name.split(' ')[0];
}
