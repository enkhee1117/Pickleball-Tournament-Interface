import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth';
import { TPMark, TPWordmark } from '@/components/ui/TPMark';
import { Chip } from '@/components/ui/Chip';
import { Avatar, playerFromName } from '@/components/ui/Avatar';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Icons } from '@/components/ui/icons';
import type { Tournament } from '@/lib/types';
import { HomeGreeting } from './HomeGreeting';
import { MarketingLanding } from './MarketingLanding';

type LiveMatch = {
  id: string;
  tournament_id: string;
  tournament_name: string;
  round_label: string | null;
  court_label: string | null;
  team_a_label: string;
  team_b_label: string;
  team_a_score: number | null;
  team_b_score: number | null;
};

export default async function HomePage() {
  const profile = await getProfile();

  if (!profile) {
    return <MarketingLanding />;
  }

  const supabase = await createClient();
  const greetingName = profile.display_name?.split(' ')[0] ?? 'Player';

  // Pull every tournament the user belongs to, then pick the most relevant
  // one for the hero (active beats draft; both beat completed). Live matches
  // are derived from the same tournament set so we never show fake content.
  const { data: memberRows } = await supabase
    .from('tournament_members')
    .select('tournaments(*)')
    .eq('user_id', profile.id);
  const tournaments = ((memberRows ?? []) as unknown as { tournaments: Tournament | null }[])
    .map((r) => r.tournaments)
    .filter((t): t is Tournament => !!t)
    .sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at));

  const activeTournaments = tournaments.filter((t) => t.status === 'active');
  const draftTournaments = tournaments.filter((t) => t.status === 'draft');
  const hero = activeTournaments[0] ?? draftTournaments[0] ?? tournaments[0] ?? null;

  let liveMatches: LiveMatch[] = [];
  let heroPlayerCount: number | null = null;
  let heroLiveCount = 0;
  if (tournaments.length > 0) {
    const tournamentIds = tournaments.map((t) => t.id);
    const [{ data: matchRows }, heroRoster] = await Promise.all([
      supabase
        .from('matches')
        .select(
          'id,tournament_id,round_label,court_label,team_a_label,team_b_label,team_a_score,team_b_score,completed_at',
        )
        .in('tournament_id', tournamentIds)
        .is('completed_at', null)
        .or('team_a_score.gt.0,team_b_score.gt.0')
        .order('court_label', { ascending: true })
        .limit(20),
      hero
        ? supabase
            .from('tournament_players')
            .select('id', { head: true, count: 'exact' })
            .eq('tournament_id', hero.id)
        : Promise.resolve({ count: null as number | null }),
    ]);

    const tournamentNames = new Map(tournaments.map((t) => [t.id, t.name]));
    liveMatches = ((matchRows ?? []) as Omit<LiveMatch, 'tournament_name'>[]).map((m) => ({
      ...m,
      tournament_name: tournamentNames.get(m.tournament_id) ?? '',
    }));
    heroLiveCount = liveMatches.filter((m) => m.tournament_id === hero?.id).length;
    heroPlayerCount = heroRoster?.count ?? null;
  }

  return (
    <div className="flex min-h-full flex-col bg-paper">
      <div className="flex items-center justify-between px-[18px] pt-3.5 pb-3">
        <TPWordmark size={14} />
        <Link
          href="/history"
          aria-label="History"
          className="flex h-10 w-10 items-center justify-center rounded-xl text-ink"
        >
          {Icons.history}
        </Link>
      </div>

      <div className="flex-1">
        <div className="px-[18px] pt-2 pb-[18px]">
          <HomeGreeting name={greetingName} />
          <Headline tournaments={tournaments} liveMatches={liveMatches} />
        </div>

        <div className="px-[18px] pb-[18px]">
          {hero ? (
            <HeroTournament
              tournament={hero}
              playerCount={heroPlayerCount}
              liveCount={heroLiveCount}
            />
          ) : (
            <EmptyHero />
          )}
        </div>

        {liveMatches.length > 0 && (
          <>
            <SectionHeader
              title="On court right now"
              action={<Link href="/tournaments">See all</Link>}
            />
            <div className="grid gap-3 px-[18px]">
              {liveMatches.slice(0, 6).map((m) => (
                <LiveMatchCard key={m.id} m={m} />
              ))}
            </div>
          </>
        )}

        <SectionHeader title="Quick start" />
        <div className="grid grid-cols-2 gap-2.5 px-[18px]">
          <QuickAction href="/tournaments/new" tone="ink" icon={Icons.plus} label="New tournament" />
          <QuickAction href="/join" icon={Icons.qr} label="Join with code" />
          <QuickAction href="/history" icon={Icons.bars} label="My stats" />
          <QuickAction href="/tournaments" icon={Icons.trophy} label="Browse" />
        </div>

        <div className="h-24" />
      </div>
    </div>
  );
}

function Headline({
  tournaments,
  liveMatches,
}: {
  tournaments: Tournament[];
  liveMatches: LiveMatch[];
}) {
  if (liveMatches.length > 0) {
    const courts = new Set(liveMatches.map((m) => m.court_label).filter(Boolean)).size;
    return (
      <div className="serif mt-1 text-[40px] leading-[1.05] tracking-tight text-ink">
        {courts > 0 ? `${courts} court${courts === 1 ? '' : 's'} hot.` : 'Game on.'}
        <br />
        <span className="italic" style={{ color: 'var(--court-deep)' }}>
          Live right now.
        </span>
      </div>
    );
  }
  if (tournaments.some((t) => t.status === 'active')) {
    return (
      <div className="serif mt-1 text-[40px] leading-[1.05] tracking-tight text-ink">
        Tournament&apos;s
        <br />
        <span className="italic" style={{ color: 'var(--court-deep)' }}>under way.</span>
      </div>
    );
  }
  if (tournaments.length === 0) {
    return (
      <div className="serif mt-1 text-[40px] leading-[1.05] tracking-tight text-ink">
        Spin up your
        <br />
        <span className="italic" style={{ color: 'var(--court-deep)' }}>first tournament.</span>
      </div>
    );
  }
  return (
    <div className="serif mt-1 text-[40px] leading-[1.05] tracking-tight text-ink">
      Ready when
      <br />
      <span className="italic" style={{ color: 'var(--court-deep)' }}>you are.</span>
    </div>
  );
}

function HeroTournament({
  tournament,
  playerCount,
  liveCount,
}: {
  tournament: Tournament;
  playerCount: number | null;
  liveCount: number;
}) {
  const formatLabel = formatLabelFor(tournament.format);
  const statusChip =
    tournament.status === 'active'
      ? `LIVE${liveCount ? ` · ${liveCount} ON COURT` : ''}`
      : tournament.status === 'draft'
        ? 'DRAFT · NEEDS A SCHEDULE'
        : tournament.status.toUpperCase();
  return (
    <Link
      href={`/tournaments/${tournament.id}`}
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
        <Chip tone={tournament.status === 'active' ? 'live' : 'court'}>{statusChip}</Chip>
        <div className="serif mt-2.5 pb-2 text-[28px] leading-[1.25]">{tournament.name}</div>
        <div className="mt-2 text-xs" style={{ color: 'oklch(0.85 0.04 140)' }}>
          {playerCount === null ? '—' : `${playerCount} player${playerCount === 1 ? '' : 's'}`}{' '}
          · {formatLabel}
        </div>
      </div>
      <div className="relative mt-4 flex items-center justify-between gap-2">
        <div className="text-[12px]" style={{ color: 'oklch(0.85 0.04 140)' }}>
          {tournament.format === 'partner_mixer' ? 'Open event home' : 'Open scoreboard'}
        </div>
        <span style={{ color: 'var(--court)' }}>{Icons.arrow}</span>
      </div>
    </Link>
  );
}

function EmptyHero() {
  return (
    <Link
      href="/tournaments/new"
      className="relative block overflow-hidden rounded-[22px] p-5 text-paper"
      style={{ background: 'linear-gradient(140deg, oklch(0.22 0.04 140), oklch(0.16 0.02 100))' }}
    >
      <Chip tone="court">START HERE</Chip>
      <div className="serif mt-2.5 text-[24px] leading-[1.2]">
        No tournaments yet — create one in under a minute.
      </div>
      <div className="mt-3 text-[12px]" style={{ color: 'oklch(0.85 0.04 140)' }}>
        Pick a format, drop in a roster, generate matches.
      </div>
    </Link>
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

function LiveMatchCard({ m }: { m: LiveMatch }) {
  const a = playersFromLabel(m.team_a_label);
  const b = playersFromLabel(m.team_b_label);
  const scoreA = m.team_a_score ?? 0;
  const scoreB = m.team_b_score ?? 0;
  const aWins = scoreA > scoreB;

  return (
    <Link
      href={`/tournaments/${m.tournament_id}/match/${m.id}`}
      className="relative block overflow-hidden rounded-[18px] bg-white p-3.5"
      style={{ border: '1px solid var(--line)' }}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="text-xs font-bold tracking-[0.04em] text-ink-2">
            {(m.court_label ?? 'COURT').toUpperCase()}
          </div>
          <Chip tone="live">LIVE</Chip>
        </div>
        <div className="truncate text-[11px] tracking-[0.04em] text-ink-3">
          {m.tournament_name}
          {m.round_label ? ` · ${m.round_label}` : ''}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <TeamRow players={a} score={scoreA} winning={aWins} />
        <TeamRow players={b} score={scoreB} winning={!aWins} flip />
      </div>
    </Link>
  );
}

function TeamRow({
  players,
  score,
  winning,
  flip,
}: {
  players: ReturnType<typeof playersFromLabel>;
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
        <Avatar player={players[0]} size={32} />
        {players[1] && (
          <div style={{ marginLeft: flip ? 0 : -10, marginRight: flip ? -10 : 0 }}>
            <Avatar player={players[1]} size={32} />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1" style={{ textAlign: flip ? 'right' : 'left' }}>
        <div className="truncate text-xs font-semibold text-ink">
          {players.map((p) => p?.name?.split(' ')[0]).filter(Boolean).join(' & ')}
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

function playersFromLabel(label: string) {
  const parts = label.split(/\s*&\s*|\s*\/\s*/).filter(Boolean);
  return parts.slice(0, 2).map((s) => playerFromName(s));
}

function formatLabelFor(format: string): string {
  switch (format) {
    case 'round_robin':
      return 'Round Robin';
    case 'fixed_partners':
      return 'Fixed Partners';
    case 'bracket':
      return 'Bracket';
    case 'partner_mixer':
      return 'Partner Mixer';
    default:
      return format;
  }
}
