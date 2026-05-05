import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Avatar, playerFromName } from '@/components/ui/Avatar';
import { Chip } from '@/components/ui/Chip';
import { TopBar } from '@/components/ui/TopBar';
import { Icons } from '@/components/ui/icons';
import { formatInviteCode, normalizeInviteCode, isValidInviteCode } from '@/lib/invite-codes';
import {
  computePlayerStandings,
  computeStandings,
  isRotatingPartnersData,
  type StandingsMatch,
} from '@/lib/scoring';

type PageProps = {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ tab?: 'matches' | 'standings' }>;
};

type PublicMatch = {
  id: string;
  round_label: string | null;
  court_label: string | null;
  team_a_label: string;
  team_b_label: string;
  team_a_score: number | null;
  team_b_score: number | null;
  winner_side: 'a' | 'b' | null;
  completed_at: string | null;
  match_games: { team_a_score: number; team_b_score: number }[];
};

type PublicData = {
  tournament: {
    id: string;
    name: string;
    format: string;
    status: 'draft' | 'active' | 'completed' | 'archived';
    invite_code: string;
    created_at: string;
  };
  players: { id: string; display_name: string }[];
  matches: PublicMatch[];
};

export default async function PublicTournamentPage({ params, searchParams }: PageProps) {
  const { code: rawCode } = await params;
  const sp = await searchParams;
  const tab = sp.tab ?? 'matches';
  const code = normalizeInviteCode(rawCode);

  if (!isValidInviteCode(code)) {
    return <NotFound code={rawCode} />;
  }

  const supabase = await createClient();

  const [{ data, error }, { data: { user } }] = await Promise.all([
    supabase.rpc('app_get_public_tournament_by_code', { p_code: code }),
    supabase.auth.getUser(),
  ]);

  if (error || !data) {
    return <NotFound code={code} />;
  }
  const payload = data as PublicData;
  const t = payload.tournament;
  const players = payload.players;
  const matches = payload.matches;

  // Membership check (only when signed in) so we show the right CTA.
  let isMember = false;
  if (user) {
    const { data: member } = await supabase
      .from('tournament_members')
      .select('role')
      .eq('tournament_id', t.id)
      .eq('user_id', user.id)
      .maybeSingle();
    isMember = !!member;
  }

  const liveCount = matches.filter(
    (row) => !row.completed_at && (row.team_a_score || row.team_b_score),
  ).length;
  const formatLabel = formatLabelFor(t.format);

  return (
    <div className="flex min-h-full flex-col bg-paper">
      <div
        className="relative overflow-hidden px-[18px] pb-[18px]"
        style={{ background: 'var(--ink)', color: 'var(--paper)' }}
      >
        <TopBar
          dark
          left={
            <Link
              href="/"
              aria-label="Home"
              className="flex h-10 w-10 items-center justify-center rounded-xl"
              style={{ color: 'var(--paper)' }}
            >
              {Icons.back}
            </Link>
          }
        />
        <div className="pl-1">
          <Chip tone={t.status === 'active' ? 'live' : 'court'}>
            {t.status === 'active' ? `LIVE${liveCount ? ` · ${liveCount} ON COURT` : ''}` : t.status.toUpperCase()}
          </Chip>
          <div className="serif mt-2 text-[32px] leading-[1.05] tracking-tight">{t.name}</div>
          <div className="mt-1.5 text-xs opacity-60">
            {formatLabel} · {players.length} player{players.length === 1 ? '' : 's'} · code {formatInviteCode(t.invite_code)}
          </div>
        </div>

        <div
          className="mt-4 flex gap-1 rounded-xl p-1"
          style={{ background: 'oklch(0.24 0.02 100)' }}
        >
          {(
            [
              ['matches', 'Matches', liveCount],
              ['standings', 'Standings', 0],
            ] as Array<['matches' | 'standings', string, number]>
          ).map(([id, label, badge]) => {
            const on = tab === id;
            return (
              <Link
                key={id}
                href={`/t/${code}?tab=${id}`}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-[9px] px-1.5 py-2 text-xs font-semibold"
                style={{
                  background: on ? 'var(--paper)' : 'transparent',
                  color: on ? 'var(--ink)' : 'oklch(0.78 0.02 100)',
                }}
              >
                {label}
                {badge ? (
                  <span
                    className="flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-white"
                    style={{ background: 'var(--serve)' }}
                  >
                    {badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-24">
        <CtaBar
          tournamentId={t.id}
          inviteCode={t.invite_code}
          authed={!!user}
          isMember={isMember}
        />

        {tab === 'matches' && <MatchesTab matches={matches} />}
        {tab === 'standings' && <StandingsTab matches={matches} />}
      </div>
    </div>
  );
}

function CtaBar({
  tournamentId,
  inviteCode,
  authed,
  isMember,
}: {
  tournamentId: string;
  inviteCode: string;
  authed: boolean;
  isMember: boolean;
}) {
  if (authed && isMember) {
    return (
      <div className="px-[18px] pt-3.5">
        <Link
          href={`/tournaments/${tournamentId}`}
          className="block w-full rounded-2xl px-5 py-3.5 text-center text-base font-semibold tracking-tight"
          style={{ background: 'var(--ink)', color: 'var(--paper)' }}
        >
          Open scoreboard →
        </Link>
      </div>
    );
  }
  if (authed) {
    return (
      <div className="px-[18px] pt-3.5">
        <Link
          href={`/join?code=${inviteCode}`}
          className="block w-full rounded-2xl px-5 py-3.5 text-center text-base font-semibold tracking-tight"
          style={{ background: 'var(--court)', color: 'oklch(0.2 0.04 140)' }}
        >
          Join this tournament →
        </Link>
      </div>
    );
  }
  return (
    <div className="grid gap-2 px-[18px] pt-3.5">
      <Link
        href={`/login?next=${encodeURIComponent(`/join?code=${inviteCode}`)}`}
        className="block w-full rounded-2xl px-5 py-3.5 text-center text-base font-semibold tracking-tight"
        style={{ background: 'var(--court)', color: 'oklch(0.2 0.04 140)' }}
      >
        Sign in to join
      </Link>
      <Link
        href={`/signup?next=${encodeURIComponent(`/join?code=${inviteCode}`)}`}
        className="block w-full rounded-2xl px-5 py-3 text-center text-[13px] font-semibold tracking-tight"
        style={{ background: '#fff', color: 'var(--ink)', border: '1px solid var(--line)' }}
      >
        Don&apos;t have an account? Sign up
      </Link>
    </div>
  );
}

function MatchesTab({ matches }: { matches: PublicMatch[] }) {
  if (matches.length === 0) {
    return (
      <div className="px-[18px] pt-6">
        <div
          className="rounded-2xl bg-white p-5 text-center text-sm text-ink-3"
          style={{ border: '1px dashed var(--line)' }}
        >
          The schedule isn&apos;t out yet. Check back once the organizer generates matches.
        </div>
      </div>
    );
  }

  const byRound = new Map<string, PublicMatch[]>();
  for (const row of matches) {
    const key = row.round_label ?? 'Round';
    const list = byRound.get(key) ?? [];
    list.push(row);
    byRound.set(key, list);
  }
  const rounds = [...byRound.keys()].sort((a, b) => roundNumber(a) - roundNumber(b));

  return (
    <div className="py-3.5">
      {rounds.map((r) => {
        const list = byRound.get(r) ?? [];
        const done = list.filter((x) => x.completed_at).length;
        return (
          <div key={r} className="mb-[18px]">
            <div className="flex items-baseline justify-between px-[18px] py-2">
              <div className="serif text-[22px] text-ink">{r}</div>
              <div className="text-[11px] tracking-[0.04em] text-ink-3">
                {done}/{list.length} DONE
              </div>
            </div>
            <div className="grid gap-2.5 px-[18px]">
              {list.map((row) => (
                <PublicMatchCard key={row.id} row={row} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PublicMatchCard({ row }: { row: PublicMatch }) {
  const a = playersFromLabel(row.team_a_label);
  const b = playersFromLabel(row.team_b_label);
  const scoreA = row.team_a_score ?? 0;
  const scoreB = row.team_b_score ?? 0;
  const isDone = !!row.completed_at;
  const isLive = !isDone && (scoreA > 0 || scoreB > 0);
  const aWins = scoreA > scoreB;

  return (
    <div
      className="relative block overflow-hidden rounded-2xl bg-white p-3"
      style={{
        borderTop: '1px solid var(--line)',
        borderRight: '1px solid var(--line)',
        borderBottom: '1px solid var(--line)',
        borderLeft: isLive ? '3px solid var(--serve)' : '1px solid var(--line)',
      }}
    >
      <div className="mb-2.5 flex items-center justify-between">
        <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-2">
          {row.court_label ?? 'COURT —'}
        </div>
        {isLive && <Chip tone="live">LIVE</Chip>}
        {isDone && <Chip tone="court">FINAL</Chip>}
        {!isLive && !isDone && <Chip tone="ghost">UP NEXT</Chip>}
      </div>
      <TeamLine players={a} score={scoreA} winning={isDone && aWins} live={isLive && aWins} />
      <div className="my-1.5 h-px" style={{ background: 'var(--line)' }} />
      <TeamLine players={b} score={scoreB} winning={isDone && !aWins} live={isLive && !aWins} />
    </div>
  );
}

function TeamLine({
  players,
  score,
  winning,
  live,
}: {
  players: ReturnType<typeof playersFromLabel>;
  score: number;
  winning?: boolean;
  live?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5 px-0.5 py-1">
      <div className="flex">
        <Avatar player={players[0]} size={26} />
        {players[1] && (
          <div className="-ml-2">
            <Avatar player={players[1]} size={26} />
          </div>
        )}
      </div>
      <div
        className="min-w-0 flex-1 text-[13px]"
        style={{ fontWeight: winning ? 600 : 500, color: winning ? 'var(--ink)' : 'var(--ink-2)' }}
      >
        {players.map((p) => p?.name?.split(' ')[0]).filter(Boolean).join(' & ')}
      </div>
      {winning && <span style={{ color: 'var(--court-deep)' }}>{Icons.check}</span>}
      <div
        className="mono min-w-[32px] text-right text-[22px] font-bold"
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

function StandingsTab({ matches }: { matches: PublicMatch[] }) {
  const completed = matches.filter((row) => row.completed_at && row.winner_side !== null);
  if (completed.length === 0) {
    return (
      <div className="px-[18px] pt-6">
        <div
          className="rounded-2xl bg-white p-5 text-center text-sm text-ink-3"
          style={{ border: '1px dashed var(--line)' }}
        >
          No standings yet — completed matches show up here as they get scored.
        </div>
      </div>
    );
  }

  const standingsMatches: StandingsMatch[] = completed.map((row) => {
    const games = row.match_games ?? [];
    const games_won_a = games.filter((g) => g.team_a_score > g.team_b_score).length;
    const games_won_b = games.filter((g) => g.team_b_score > g.team_a_score).length;
    return {
      id: row.id,
      team_a_label: row.team_a_label,
      team_b_label: row.team_b_label,
      winner_side: row.winner_side,
      team_a_score: row.team_a_score,
      team_b_score: row.team_b_score,
      games_won_a,
      games_won_b,
    };
  });

  const usePlayerStandings = isRotatingPartnersData(standingsMatches);
  const rows = usePlayerStandings
    ? computePlayerStandings(standingsMatches)
    : computeStandings(standingsMatches);

  return (
    <div className="px-[18px] py-3.5">
      <div
        className="grid items-center px-1 pb-2 pt-2.5 text-[10px] uppercase tracking-[0.08em] text-ink-3"
        style={{ gridTemplateColumns: '24px 1fr 50px 50px 50px', borderBottom: '1px solid var(--line)' }}
      >
        <div>#</div>
        <div>{usePlayerStandings ? 'PLAYER' : 'TEAM'}</div>
        <div className="text-right">W–L</div>
        <div className="text-right">PD</div>
        <div className="text-right">WIN%</div>
      </div>
      {rows.map((row, i) => {
        const winPct = Math.round(row.winPct * 100);
        return (
          <div
            key={row.team}
            className="grid items-center px-1 py-2.5"
            style={{ gridTemplateColumns: '24px 1fr 50px 50px 50px', borderBottom: '1px solid var(--line)' }}
          >
            <div className="text-[13px] font-semibold text-ink-3">{i + 1}</div>
            <div className="flex items-center gap-2.5">
              <Avatar player={playerFromName(row.team)} size={32} />
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold text-ink">{row.team}</div>
                <div className="text-[10.5px] text-ink-3">
                  {row.matchesPlayed} match{row.matchesPlayed === 1 ? '' : 'es'}
                </div>
              </div>
            </div>
            <div className="mono text-right text-[13px] font-semibold text-ink">
              {row.matchWins}–{row.matchLosses}
            </div>
            <div
              className="mono text-right text-[13px] font-semibold"
              style={{
                color: row.pointDiff > 0 ? 'var(--court-deep)' : row.pointDiff < 0 ? 'var(--berry)' : 'var(--ink-3)',
              }}
            >
              {row.pointDiff > 0 ? '+' : ''}
              {row.pointDiff}
            </div>
            <div className="mono text-right text-[13px] text-ink-2">{winPct}%</div>
          </div>
        );
      })}
    </div>
  );
}

function NotFound({ code }: { code: string }) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-paper px-[18px] text-center">
      <div className="serif text-[28px] leading-[1.1] text-ink">
        We couldn&apos;t find that
        <br />
        <span className="italic" style={{ color: 'var(--court-deep)' }}>tournament.</span>
      </div>
      <div className="mt-2 text-[13px] text-ink-3">
        The invite code{' '}
        <span className="mono">{formatInviteCode(code) || '—'}</span> didn&apos;t match anything.
      </div>
      <Link
        href="/"
        className="mt-6 rounded-xl px-5 py-2.5 text-[13px] font-semibold"
        style={{ background: 'var(--ink)', color: 'var(--paper)' }}
      >
        Back to home
      </Link>
    </div>
  );
}

function playersFromLabel(label: string) {
  const parts = label.split(/\s*&\s*|\s*\/\s*/).filter(Boolean);
  return parts.slice(0, 2).map(playerFromName);
}

function roundNumber(label: string): number {
  const match = label.match(/(\d+)/);
  return match ? Number.parseInt(match[1], 10) : Number.POSITIVE_INFINITY;
}

function formatLabelFor(format: string): string {
  switch (format) {
    case 'round_robin':
      return 'Round Robin';
    case 'fixed_partners':
      return 'Fixed Partners';
    case 'bracket':
      return 'Bracket';
    default:
      return format;
  }
}
