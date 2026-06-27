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
    return <SignedOutHome />;
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

function SignedOutHome() {
  const heartbeat = [
    ['01', 'Vote, blind', 'Spend tokens on the partners you want. Up, down, or save them for raffle odds.'],
    ['02', 'Lock', 'The organizer closes voting so every ballot stays sealed before the draw.'],
    ['03', 'Draw', 'The weighted engine turns the night’s token energy into new teams.'],
    ['04', 'Reveal', 'Partners and courts drop on phones and the presentation screen together.'],
  ];
  const features = [
    ['Blind by design', 'Votes, tallies, and pair previews stay hidden until the draw.'],
    ['Token economy', 'Start scarce, buy one boost, and spend influence where it matters.'],
    ['Pooled betting', 'Friendly chip markets on podium places, settled after final standings.'],
    ['Raffle draw', 'Tickets come from being a wanted teammate and from unused base tokens.'],
    ['Anonymous join', 'QR invite to instant play now, account upgrade later.'],
    ['Every screen', 'Player phones, organizer controls, and big-screen reveal from one app.'],
  ];
  return (
    <div data-public-landing className="relative left-1/2 min-h-full w-[calc(100vw-15px)] -translate-x-1/2 overflow-x-hidden bg-paper text-ink">
      <header className="sticky top-0 z-20 border-b bg-paper/90 backdrop-blur-xl" style={{ borderColor: 'var(--line)' }}>
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-[18px]">
          <TPWordmark size={14} />
          <div className="flex items-center gap-2">
            <Link href="/join" className="hidden rounded-xl px-3 py-2 text-sm font-semibold text-ink-2 sm:block">
              Join
            </Link>
            <Link href="/login" className="rounded-xl px-3 py-2 text-sm font-semibold text-ink-2">
              Sign in
            </Link>
            <Link href="/signup" className="rounded-xl px-4 py-2 text-sm font-bold" style={{ background: 'var(--court)', color: 'oklch(0.2 0.04 140)' }}>
              Start
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden px-[18px] py-12 sm:py-18 lg:py-24">
          <div className="pointer-events-none absolute right-[-12%] top-[-20%] h-[420px] w-[420px] rounded-full bg-[color:var(--court)] opacity-15 blur-3xl" />
          <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
            <div>
              <LandingEyebrow>Mixed-doubles, reinvented</LandingEyebrow>
              <h1 className="serif mt-4 max-w-[720px] text-[46px] leading-none tracking-tight text-ink sm:text-[64px] lg:text-[78px]">
                Who you play with is <span className="italic" style={{ color: 'var(--court-deep)' }}>the game.</span>
              </h1>
              <p className="mt-5 max-w-[560px] text-base leading-7 text-ink-2 sm:text-lg">
                TourneyPal runs social pickleball mixers where players spend tokens to vote for partners, then the draw reveals pairings live. Suspense, light strategy, and a dash of chance. No spreadsheet required.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link href="/signup" className="inline-flex items-center gap-2 rounded-2xl px-5 py-4 text-base font-bold" style={{ background: 'var(--court)', color: 'oklch(0.2 0.04 140)' }}>
                  Start an event {Icons.arrow}
                </Link>
                <Link href="/login" className="inline-flex items-center rounded-2xl border px-5 py-4 text-base font-bold text-ink" style={{ borderColor: 'var(--line)' }}>
                  Open the app
                </Link>
              </div>
              <div className="mt-8 grid max-w-[560px] grid-cols-3 gap-4">
                <LandingStat value="16-50+" label="players" />
                <LandingStat value="Blind" label="by design" />
                <LandingStat value="Phone-TV" label="one app" />
              </div>
            </div>

            <div className="mx-auto w-full max-w-[360px]">
              <LandingPhone />
            </div>
          </div>
        </section>

        <section className="px-[18px] pb-14">
          <div className="mx-auto max-w-6xl overflow-hidden rounded-[26px] border bg-ink shadow-2xl" style={{ borderColor: 'var(--line)' }}>
            <div className="relative min-h-[300px] sm:min-h-[440px]">
              <img src="/landing/scenes/showcase.png" alt="Players celebrating as partner pairings are revealed" className="absolute inset-0 h-full w-full object-cover object-center" />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent p-6 text-paper sm:p-8">
                <LandingEyebrow light>Reveal night</LandingEyebrow>
                <div className="serif mt-2 text-[34px] leading-none sm:text-[46px]">The moment the draw drops.</div>
                <p className="mt-2 max-w-[560px] text-sm leading-6 text-white/80 sm:text-base">
                  Phones up, partners revealed, the room loud. TourneyPal turns pairing into the highlight of the night.
                </p>
              </div>
            </div>
          </div>
        </section>

        <LandingSection eyebrow="The heartbeat" title="Vote. Lock. Draw. Reveal." body="Every round runs the same four-beat loop: the part that turns a casual mixer into a show.">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {heartbeat.map(([n, title, body]) => (
              <LandingCard key={n}>
                <div className="mono text-xs font-bold" style={{ color: 'var(--court-deep)' }}>{n}</div>
                <h3 className="mt-3 text-xl font-bold tracking-tight text-ink">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-ink-3">{body}</p>
              </LandingCard>
            ))}
          </div>
        </LandingSection>

        <LandingSection eyebrow="What is inside" title="A social mixer with a brain." body="Everything needed to run a lively, fair, genuinely fun event for players and organizers alike.">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(([title, body]) => (
              <LandingCard key={title}>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'var(--paper-2)', color: 'var(--court-deep)' }}>
                  {Icons.spark}
                </div>
                <h3 className="mt-4 text-lg font-bold tracking-tight text-ink">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-ink-3">{body}</p>
              </LandingCard>
            ))}
          </div>
        </LandingSection>

        <section className="border-y px-[18px] py-16" style={{ borderColor: 'var(--line)', background: '#fff' }}>
          <div className="mx-auto max-w-6xl">
            <LandingEyebrow>One product, three modes</LandingEyebrow>
            <h2 className="serif mt-3 max-w-[720px] text-[38px] leading-none tracking-tight text-ink sm:text-[52px]">
              From club night to big tournament.
            </h2>
            <div className="mt-8 grid gap-5 md:grid-cols-3">
              <ScaleCard image="/landing/scenes/club.png" stat="16-32" title="Club night" body="Anonymous QR join, no accounts needed. Show up and play." />
              <ScaleCard image="/landing/scenes/league.png" stat="∞" title="Recurring league" body="Persistent identities and season-long standings arcs." />
              <ScaleCard image="/landing/scenes/tourney.png" stat="50+" title="Large tournament" body="Multiple courts with sit-out rotation that keeps everyone moving." />
            </div>
          </div>
        </section>

        <section className="px-[18px] py-16">
          <div className="mx-auto max-w-5xl rounded-[28px] border p-8 text-center sm:p-12" style={{ borderColor: 'color-mix(in oklch, var(--court) 35%, var(--line))', background: 'linear-gradient(150deg, color-mix(in oklch, var(--court) 18%, #fff), #fff)' }}>
            <TPMark size={42} />
            <h2 className="serif mx-auto mt-4 max-w-[680px] text-[38px] leading-none tracking-tight text-ink sm:text-[54px]">
              Make your next mixer a game.
            </h2>
            <p className="mx-auto mt-3 max-w-[560px] text-base leading-7 text-ink-2">
              Spin up an event in minutes, invite by link, run it from your phone, and let the draw do the talking.
            </p>
            <div className="mt-7 flex justify-center">
              <Link href="/signup" className="inline-flex items-center gap-2 rounded-2xl px-5 py-4 text-base font-bold" style={{ background: 'var(--court)', color: 'oklch(0.2 0.04 140)' }}>
                Start an event {Icons.arrow}
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function LandingPhone() {
  return (
    <div className="rounded-[42px] border-[8px] border-black bg-paper p-3 shadow-2xl">
      <div className="mx-auto mb-3 h-5 w-24 rounded-full bg-black" />
      <div className="rounded-2xl border p-3" style={{ borderColor: 'color-mix(in oklch, var(--court) 35%, var(--line))', background: 'color-mix(in oklch, var(--court) 10%, #fff)' }}>
        <Chip tone="court">BALLOT OPEN</Chip>
        <div className="mt-2 text-sm font-bold text-ink">Blind ballot · 5 rounds</div>
      </div>
      <div className="mt-3 rounded-2xl border bg-white p-3" style={{ borderColor: 'var(--line)' }}>
        <div className="flex items-center justify-between">
          <div className="flex gap-1">
            {Array.from({ length: 10 }).map((_, i) => (
              <span key={i} className="h-3 w-3 rounded-full" style={{ background: i < 6 ? 'var(--court)' : 'transparent', border: i < 6 ? 'none' : '1px dashed var(--line)' }} />
            ))}
          </div>
          <div className="mono text-xl font-bold text-ink">4</div>
        </div>
      </div>
      <div className="mt-3 grid gap-2">
        <VotePreview avatar="/landing/avatars/p6.png" name="Eli Brooks" token="+2" active />
        <VotePreview avatar="/landing/avatars/p3.png" name="Theo Kim" token="+" />
        <VotePreview avatar="/landing/avatars/p4.png" name="Alex Park" token="+1" active />
      </div>
    </div>
  );
}

function VotePreview({ avatar, name, token, active }: { avatar: string; name: string; token: string; active?: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border bg-white p-3" style={{ borderColor: active ? 'color-mix(in oklch, var(--court) 48%, var(--line))' : 'var(--line)' }}>
      <img src={avatar} alt="" className="h-10 w-10 rounded-full object-cover object-top" />
      <div className="min-w-0 flex-1 text-sm font-bold text-ink">{name}</div>
      <div className="mono flex h-9 w-9 items-center justify-center rounded-xl text-sm font-bold" style={{ background: active ? 'var(--court)' : 'var(--paper-2)', color: active ? 'oklch(0.2 0.04 140)' : 'var(--ink-2)' }}>
        {token}
      </div>
    </div>
  );
}

function LandingEyebrow({ children, light }: { children: React.ReactNode; light?: boolean }) {
  return (
    <div className="mono text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: light ? 'var(--court)' : 'var(--court-deep)' }}>
      {children}
    </div>
  );
}

function LandingStat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="text-2xl font-black tracking-tight text-ink">{value}</div>
      <div className="mono mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-ink-3">{label}</div>
    </div>
  );
}

function LandingSection({ eyebrow, title, body, children }: { eyebrow: string; title: string; body: string; children: React.ReactNode }) {
  return (
    <section className="px-[18px] py-16">
      <div className="mx-auto max-w-6xl">
        <div className="max-w-[640px]">
          <LandingEyebrow>{eyebrow}</LandingEyebrow>
          <h2 className="serif mt-3 text-[38px] leading-none tracking-tight text-ink sm:text-[52px]">{title}</h2>
          <p className="mt-3 text-base leading-7 text-ink-2">{body}</p>
        </div>
        <div className="mt-8">{children}</div>
      </div>
    </section>
  );
}

function LandingCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[18px] border bg-white p-5 transition-transform hover:-translate-y-1" style={{ borderColor: 'var(--line)' }}>
      {children}
    </div>
  );
}

function ScaleCard({ image, stat, title, body }: { image: string; stat: string; title: string; body: string }) {
  return (
    <div>
      <img src={image} alt="" className="h-48 w-full rounded-[18px] border object-cover" style={{ borderColor: 'var(--line)' }} />
      <div className="mt-4 text-[38px] font-black leading-none" style={{ color: 'var(--court-deep)' }}>{stat}</div>
      <h3 className="mt-2 text-xl font-bold tracking-tight text-ink">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-ink-3">{body}</p>
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
      href={tournament.format === 'partner_mixer' ? `/tournaments/${tournament.id}/mixer` : `/tournaments/${tournament.id}`}
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
          {tournament.format === 'partner_mixer' ? 'Open Mixer' : 'Open scoreboard'}
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
