// Medal podium from the design handoff's "Finalize standings" reveal: gold
// center (tallest), silver left, bronze right, each a disc + ringed avatar +
// name + points on a raised pedestal. Pure presentational — pass the top rows.
// Colors come from tokens so it reads on either the light board or the fixed
// dark player/projector surface.

export interface PodiumEntry {
  playerId: string;
  name: string;
  points: number;
  isMe?: boolean;
}

const MEDALS = {
  gold: { ring: 'var(--amber)', disc: 'var(--amber)', ped: 96, label: '1' },
  silver: { ring: 'oklch(0.82 0.02 250)', disc: 'oklch(0.82 0.02 250)', ped: 68, label: '2' },
  bronze: { ring: 'oklch(0.66 0.09 55)', disc: 'oklch(0.66 0.09 55)', ped: 50, label: '3' },
} as const;

const initials = (n: string) =>
  n
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

const firstName = (n: string) => n.split(' ')[0];

function PodCol({ entry, tier, small }: { entry: PodiumEntry; tier: keyof typeof MEDALS; small?: boolean }) {
  const m = MEDALS[tier];
  const av = small ? 48 : 64;
  return (
    <div className="flex flex-1 flex-col items-center justify-end">
      <span
        className="mb-1.5 flex items-center justify-center rounded-full font-mono text-[11px] font-bold"
        style={{ width: 22, height: 22, background: m.disc, color: 'oklch(0.2 0.03 90)' }}
        aria-hidden
      >
        {m.label}
      </span>
      <span
        className="flex items-center justify-center rounded-full font-semibold"
        style={{
          width: av,
          height: av,
          fontSize: av * 0.34,
          background: 'color-mix(in oklch, currentColor 10%, transparent)',
          border: `3px solid ${m.ring}`,
          boxShadow: `0 0 0 4px color-mix(in oklch, ${m.ring} 22%, transparent)`,
        }}
        aria-hidden
      >
        {initials(entry.name)}
      </span>
      <div className="mt-2 max-w-full truncate text-center text-[14px] font-bold">
        {entry.isMe ? 'You' : firstName(entry.name)}
      </div>
      <div className="mono text-[13px] font-bold" style={{ color: 'var(--court)' }}>
        {entry.points}
      </div>
      <div
        className="mt-2 w-full rounded-t-[10px]"
        style={{
          height: small ? m.ped * 0.7 : m.ped,
          background: `linear-gradient(180deg, color-mix(in oklch, ${m.ring} 32%, transparent), color-mix(in oklch, ${m.ring} 8%, transparent))`,
          borderTop: `2px solid ${m.ring}`,
        }}
      />
    </div>
  );
}

export function MedalPodium({ top3, title, small }: { top3: PodiumEntry[]; title?: string; small?: boolean }) {
  if (top3.length === 0) return null;
  const [first, second, third] = top3;
  return (
    <div className="flex flex-col">
      {title ? (
        <div className="mb-2 text-center mono text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--court)' }}>
          {title}
        </div>
      ) : null}
      <div className="flex items-end gap-2.5">
        {second ? <PodCol entry={second} tier="silver" small={small} /> : <div className="flex-1" />}
        {first ? <PodCol entry={first} tier="gold" small={small} /> : null}
        {third ? <PodCol entry={third} tier="bronze" small={small} /> : <div className="flex-1" />}
      </div>
    </div>
  );
}
