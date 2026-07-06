import { Avatar, type AvatarPlayer } from '@/components/ui/Avatar';

// The "Ballot locked" pane (handoff player.html §244-275): the "Your picks are
// in" hero with ballots-in / to-the-draw / tokens-spent stats, the "What
// happens next" step list, and the player's own final ballot (blind — only they
// ever see their picks). All read-only.

export interface BallotPick {
  playerId: string;
  name: string;
  tokens: number; // up-tokens on this pick
  down: boolean; // "rather not"
  avatar: AvatarPlayer;
}

const STEPS = [
  { t: 'The draw runs', d: 'The organizer fires the weighted draw for the whole round.' },
  { t: 'Teams revealed', d: 'Your partner, court & opponents appear here and on the big screen.' },
  { t: 'Head to your court', d: 'Play your game to 11, win by 2.' },
  { t: 'Scores & standings', d: 'Report the score — standings update live.' },
];

export function BallotLockedPane({
  ballotsIn,
  rosterCount,
  tokensSpent,
  picks,
}: {
  ballotsIn: number;
  rosterCount: number;
  tokensSpent: number;
  picks: BallotPick[];
}) {
  const allIn = rosterCount > 0 && ballotsIn >= rosterCount;
  const toDraw = allIn ? 'Any moment' : `${Math.max(0, rosterCount - ballotsIn)} to go`;

  return (
    <div className="flex flex-col gap-3">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-[18px] p-5" style={{ background: 'var(--night-card)', border: '1px solid var(--night-line)' }}>
        <div className="flex items-start gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/design-handoff/characters/voter.png" alt="" width={76} height={76} className="hidden shrink-0 sm:block" style={{ width: 76, filter: 'drop-shadow(0 10px 18px rgba(0,0,0,.4))' }} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: 'var(--court)' }}>
              <span aria-hidden>🔒</span> Ballot locked
            </div>
            <h2 className="serif mt-1.5 text-[32px] leading-none">Your picks are in.</h2>
            <p className="mt-2 max-w-[46ch] text-[13.5px] leading-[1.5]" style={{ color: 'var(--night-text2)' }}>
              All five rounds locked together — no take-backs. Sit tight while the organizer runs the draw. Your partner
              and court drop right here the moment it fires.
            </p>
            <div className="mt-4 grid grid-cols-3 gap-3">
              <HeroStat v={`${ballotsIn}/${rosterCount}`} l="Ballots in" />
              <HeroStat v={toDraw} l="To the draw" />
              <HeroStat v={String(tokensSpent)} l="Tokens spent" />
            </div>
          </div>
        </div>
      </div>

      {/* What happens next */}
      <div className="rounded-[18px] p-5" style={{ background: 'var(--night-card)', border: '1px solid var(--night-line)' }}>
        <div className="serif mb-3 text-[20px]">What happens next</div>
        <div className="flex flex-col gap-3">
          {STEPS.map((s, i) => (
            <div key={s.t} className="flex gap-3">
              <span
                className="mono grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-bold"
                style={{ background: 'var(--night-inset)', border: '1px solid var(--night-line)', color: 'var(--court)' }}
              >
                {i + 1}
              </span>
              <div>
                <div className="text-[14px] font-bold">{s.t}</div>
                <div className="text-[12.5px]" style={{ color: 'var(--night-text2)' }}>{s.d}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Your final ballot */}
      <div className="rounded-[18px] p-5" style={{ background: 'var(--night-card)', border: '1px solid var(--night-line)' }}>
        <div className="mb-3 flex items-center justify-between">
          <div className="serif text-[20px]">Your final ballot</div>
          <span className="mono rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em]" style={{ background: 'var(--night-inset)', color: 'var(--night-text2)', border: '1px solid var(--night-line)' }}>
            Locked
          </span>
        </div>
        {picks.length === 0 ? (
          <div className="text-[13px]" style={{ color: 'var(--night-text3)' }}>
            You didn&apos;t spend any tokens this round — the draw will pair you at random.
          </div>
        ) : (
          <div className="flex flex-col">
            {picks.map((p) => (
              <div key={p.playerId} className="flex items-center gap-3 border-t py-2.5 first:border-t-0 first:pt-0" style={{ borderColor: 'var(--night-line)' }}>
                <Avatar player={p.avatar} size={30} />
                <span className="flex-1 truncate text-[14px] font-semibold">{p.name}</span>
                {p.down ? (
                  <span className="mono text-[12px] font-bold" style={{ color: 'var(--serve)' }}>rather not</span>
                ) : (
                  <span className="mono text-[13px] font-bold" style={{ color: 'var(--court)' }}>+{p.tokens}</span>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="mt-3 flex items-center gap-2 text-[12px]" style={{ color: 'var(--night-text3)' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
            <path d="M4 4l16 16M9.5 9.6A2.6 2.6 0 0012 14.6M6.2 6.7C3.9 8.2 2.5 12 2.5 12s3.5 6.5 9.5 6.5c1.6 0 3-.45 4.2-1.1M10 5.8c.65-.13 1.3-.2 2-.2 6 0 9.5 6.4 9.5 6.4a17 17 0 01-2.3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          Blind — no one saw these but you.
        </div>
      </div>
    </div>
  );
}

function HeroStat({ v, l }: { v: string; l: string }) {
  return (
    <div>
      <div className="mono text-[22px] font-bold leading-none" style={{ color: 'var(--court)' }}>{v}</div>
      <div className="mono mt-1 text-[10px] uppercase tracking-[0.08em]" style={{ color: 'var(--night-text3)' }}>{l}</div>
    </div>
  );
}
