import Link from 'next/link';
import { getProfile } from '@/lib/auth';
import { TPWordmark } from '@/components/ui/TPMark';
import { Chip } from '@/components/ui/Chip';
import { Avatar } from '@/components/ui/Avatar';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Icons } from '@/components/ui/icons';
import { SAMPLE_MATCHES, SAMPLE_ME, getSamplePlayer } from '@/lib/sample-data';

export default async function HomePage() {
  const profile = await getProfile();
  const greetingName = profile?.display_name?.split(' ')[0] ?? SAMPLE_ME.name.split(' ')[0];

  const live = SAMPLE_MATCHES.filter((m) => m.status === 'live');

  return (
    <div className="flex min-h-full flex-col bg-paper">
      <div className="flex items-center justify-between px-[18px] pt-3.5 pb-3">
        <TPWordmark size={14} />
        <Link href="/history" aria-label="History" className="flex h-10 w-10 items-center justify-center rounded-xl text-ink">
          {Icons.history}
        </Link>
      </div>

      <div className="flex-1">
        <div className="px-[18px] pt-2 pb-[18px]">
          <div className="text-[13px] tracking-wide text-ink-3">Good evening, {greetingName} 🎾</div>
          <div className="serif mt-1 text-[40px] leading-[1.05] tracking-tight text-ink">
            Two courts hot.
            <br />
            <span className="italic" style={{ color: 'var(--court-deep)' }}>You&rsquo;re up next.</span>
          </div>
        </div>

        <div className="px-[18px] pb-[18px]">
          <Link
            href="/tournaments"
            className="relative block overflow-hidden rounded-[22px] p-5 text-paper"
            style={{ background: 'linear-gradient(140deg, oklch(0.22 0.04 140), oklch(0.16 0.02 100))' }}
          >
            <svg
              className="pointer-events-none absolute -right-[30px] -top-[10px] opacity-15"
              width="180"
              height="180"
              viewBox="0 0 180 180"
              aria-hidden
            >
              <rect x="20" y="20" width="140" height="140" stroke="var(--court)" strokeWidth="1.5" fill="none" />
              <line x1="20" y1="90" x2="160" y2="90" stroke="var(--court)" strokeWidth="1" strokeDasharray="3 3" />
              <line x1="60" y1="20" x2="60" y2="160" stroke="var(--court)" strokeWidth="1" />
              <line x1="120" y1="20" x2="120" y2="160" stroke="var(--court)" strokeWidth="1" />
            </svg>
            <div className="relative">
              <Chip tone="live">LIVE · ROUND 3 / 5</Chip>
              <div className="serif mt-2.5 pb-2 text-[28px] leading-[1.25]">Friday Night Lights</div>
              <div className="mt-2 text-xs" style={{ color: 'oklch(0.85 0.04 140)' }}>
                10 players · Round Robin · 2 courts
              </div>
            </div>
            <div className="relative mt-4 flex gap-2">
              <div className="flex-1 rounded-xl px-3 py-2.5" style={{ background: 'oklch(0.28 0.04 140)' }}>
                <div className="text-[10px] tracking-[0.06em]" style={{ color: 'oklch(0.78 0.18 135)' }}>NEXT UP</div>
                <div className="mt-0.5 text-[13px] font-semibold">You vs Jordan</div>
              </div>
              <div className="flex-1 rounded-xl px-3 py-2.5" style={{ background: 'oklch(0.28 0.04 140)' }}>
                <div className="text-[10px] tracking-[0.06em]" style={{ color: 'oklch(0.78 0.18 135)' }}>YOUR RANK</div>
                <div className="mt-0.5 text-[13px] font-semibold">2nd · 6–3 record</div>
              </div>
            </div>
          </Link>
        </div>

        <SectionHeader title="On court right now" action={<Link href="/tournaments">See all</Link>} />
        <div className="grid gap-3 px-[18px]">
          {live.map((m) => (
            <LiveMatchCard key={m.id} matchId={m.id} m={m} />
          ))}
        </div>

        <SectionHeader title="Quick start" />
        <div className="grid grid-cols-2 gap-2.5 px-[18px]">
          <QuickAction href="/tournaments/new" tone="ink" icon={Icons.plus} label="New tournament" />
          <QuickAction href="/join" icon={Icons.qr} label="Join with code" />
          <QuickAction href="/profile" icon={Icons.bars} label="My stats" />
          <QuickAction href="/history" icon={Icons.trophy} label="History" />
        </div>

        <div className="h-24" />
      </div>
    </div>
  );
}

function QuickAction({
  href,
  icon,
  label,
  tone = 'ghost',
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  tone?: 'ink' | 'ghost';
}) {
  const ink = tone === 'ink';
  return (
    <Link
      href={href}
      className="flex min-h-[88px] flex-col items-start gap-4 rounded-2xl p-3.5"
      style={{
        background: ink ? 'var(--ink)' : '#fff',
        color: ink ? 'var(--paper)' : 'var(--ink)',
        border: ink ? 'none' : '1px solid var(--line)',
      }}
    >
      <div
        className="flex h-8 w-8 items-center justify-center rounded-[10px]"
        style={{
          background: ink ? 'oklch(0.28 0.04 140)' : 'var(--paper-2)',
          color: ink ? 'var(--court)' : 'var(--ink-2)',
        }}
      >
        {icon}
      </div>
      <div className="text-sm font-semibold tracking-tight">{label}</div>
    </Link>
  );
}

function LiveMatchCard({
  matchId: _matchId,
  m,
}: {
  matchId: string;
  m: (typeof SAMPLE_MATCHES)[number];
}) {
  const a1 = getSamplePlayer(m.teamA[0]);
  const a2 = getSamplePlayer(m.teamA[1]);
  const b1 = getSamplePlayer(m.teamB[0]);
  const b2 = getSamplePlayer(m.teamB[1]);
  const aWins = m.scoreA > m.scoreB;

  return (
    <Link
      href="/tournaments"
      className="relative block overflow-hidden rounded-[18px] bg-white p-3.5"
      style={{ border: '1px solid var(--line)' }}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="text-xs font-bold tracking-[0.04em] text-ink-2">COURT {m.court}</div>
          <Chip tone="live">LIVE</Chip>
        </div>
        <div className="text-[11px] tracking-[0.04em] text-ink-3">R{m.round} · TO 11</div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <TeamRow p1={a1} p2={a2} score={m.scoreA} winning={aWins} />
        <TeamRow p1={b1} p2={b2} score={m.scoreB} winning={!aWins} flip />
      </div>
    </Link>
  );
}

function TeamRow({
  p1,
  p2,
  score,
  winning,
  flip,
}: {
  p1?: { short: string; color: string; name: string };
  p2?: { short: string; color: string; name: string };
  score: number;
  winning?: boolean;
  flip?: boolean;
}) {
  return (
    <div
      className="flex flex-1 items-center gap-2"
      style={{ flexDirection: flip ? 'row-reverse' : 'row' }}
    >
      <div className="flex" style={{ flexDirection: flip ? 'row-reverse' : 'row' }}>
        <Avatar player={p1} size={32} />
        <div style={{ marginLeft: flip ? 0 : -10, marginRight: flip ? -10 : 0 }}>
          <Avatar player={p2} size={32} />
        </div>
      </div>
      <div className="min-w-0 flex-1" style={{ textAlign: flip ? 'right' : 'left' }}>
        <div className="truncate text-xs font-semibold text-ink">
          {p1?.name.split(' ')[0]} & {p2?.name.split(' ')[0]}
        </div>
        <div
          className="mono -mt-0.5 text-[26px] font-bold tracking-tight"
          style={{ color: winning ? 'var(--court-deep)' : 'var(--ink-3)', letterSpacing: '-0.02em' }}
        >
          {score}
        </div>
      </div>
    </div>
  );
}
