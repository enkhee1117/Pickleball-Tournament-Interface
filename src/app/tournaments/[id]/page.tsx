import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Tournament } from '@/lib/types';
import { TopBar } from '@/components/ui/TopBar';
import { Chip } from '@/components/ui/Chip';
import { Avatar, playerFromName } from '@/components/ui/Avatar';
import { Icons } from '@/components/ui/icons';
import { SAMPLE_PLAYERS } from '@/lib/sample-data';
import {
  ALL_PLAYOFF_LABELS,
  PLAYOFF_ROUND_LABELS,
  SEMI_LOSER_PLACEHOLDERS,
  SEMI_WINNER_PLACEHOLDERS,
} from '@/lib/playoffs';
import { refreshTournamentStatus } from '@/lib/tournament-status-server';
import { GeneratePlayoffsForm } from './GeneratePlayoffsForm';

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: 'matches' | 'standings' | 'bracket'; ok?: string; error?: string }>;
};

type MatchRow = {
  id: string;
  round_label: string | null;
  court_label: string | null;
  team_a_label: string;
  team_b_label: string;
  team_a_score: number | null;
  team_b_score: number | null;
  completed_at: string | null;
};

export default async function TournamentDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const sp = await searchParams;
  const tab = sp.tab ?? 'matches';
  const supabase = await createClient();

  // Self-heal lifecycle status alongside the data fetch — the page does not
  // read the new status, so we don't need to await it before the page query
  // completes. A single Postgres roundtrip via app_refresh_tournament_status.
  const [{ data: tournament }, { data: matches }, { data: players }] = await Promise.all([
    supabase
      .from('tournaments')
      .select('id,owner_user_id,name,format,status,whatsapp_group_url,invite_code,created_at,updated_at')
      .eq('id', id)
      .single(),
    supabase
      .from('matches')
      .select('id,round_label,court_label,team_a_label,team_b_label,team_a_score,team_b_score,completed_at')
      .eq('tournament_id', id)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('tournament_players')
      .select('id,display_name')
      .eq('tournament_id', id)
      .order('created_at', { ascending: true }),
    // Fire-and-forget status refresh in parallel; tab order doesn't depend on
    // its result and the next page load will see the corrected status.
    refreshTournamentStatus(supabase, id).then(() => ({ data: null })),
  ]);

  if (!tournament) notFound();
  const t = tournament as Tournament;
  const m = (matches ?? []) as MatchRow[];

  const liveCount = m.filter((row) => !row.completed_at && (row.team_a_score || row.team_b_score)).length;

  const playoffMatches = m.filter((row) =>
    (ALL_PLAYOFF_LABELS as readonly string[]).includes(row.round_label ?? ''),
  );
  const rrMatches = m.filter(
    (row) => !(ALL_PLAYOFF_LABELS as readonly string[]).includes(row.round_label ?? ''),
  );
  const playoffsExist = playoffMatches.length > 0;
  const rrPending = rrMatches.filter((row) => !row.completed_at).length;
  const canGeneratePlayoffs =
    !playoffsExist && rrMatches.length > 0 && rrPending === 0;

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
              href="/tournaments"
              aria-label="Back"
              className="flex h-10 w-10 items-center justify-center rounded-xl"
              style={{ color: 'var(--paper)' }}
            >
              {Icons.back}
            </Link>
          }
          right={
            <Link
              href={`/tournaments/${id}/invite`}
              aria-label="Share"
              className="flex h-10 w-10 items-center justify-center rounded-xl"
              style={{ color: 'var(--paper)' }}
            >
              {Icons.share}
            </Link>
          }
        />
        <div className="pl-1">
          <Chip tone={t.status === 'active' ? 'live' : 'court'}>
            {t.status === 'active' ? 'LIVE · ROUND 3 OF 5' : t.status.toUpperCase()}
          </Chip>
          <div className="serif mt-2 text-[32px] leading-[1.05] tracking-tight">{t.name}</div>
          <div className="mt-1.5 text-xs opacity-60">
            Round Robin · {(players?.length ?? 0)} players
          </div>
        </div>

        <div
          className="mt-4 flex gap-1 rounded-xl p-1"
          style={{ background: 'oklch(0.24 0.02 100)' }}
        >
          {([
            ['matches', 'Matches', liveCount],
            ['standings', 'Standings', 0],
            ['bracket', 'Bracket', 0],
          ] as Array<['matches' | 'standings' | 'bracket', string, number]>).map(([id_, label, badge]) => {
            const on = tab === id_;
            return (
              <Link
                key={id_}
                href={`/tournaments/${id}?tab=${id_}`}
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

      <div className="flex-1 overflow-y-auto">
        {sp.error && (
          <div
            className="mx-[18px] mt-3 rounded-xl border px-3 py-2 text-sm"
            style={{ borderColor: 'var(--berry)', color: 'var(--berry)', background: 'oklch(0.96 0.04 12)' }}
          >
            {sp.error}
          </div>
        )}
        {sp.ok && (
          <div
            className="mx-[18px] mt-3 rounded-xl border px-3 py-2 text-sm"
            style={{ borderColor: 'var(--court-deep)', color: 'var(--court-deep)', background: 'oklch(0.96 0.04 140)' }}
          >
            {sp.ok}
          </div>
        )}

        {tab === 'matches' && <MatchesTab tournamentId={id} matches={rrMatches} />}
        {tab === 'standings' && <StandingsTab />}
        {tab === 'bracket' && (
          <BracketTab
            tournamentId={id}
            playoffMatches={playoffMatches}
            canGenerate={canGeneratePlayoffs}
            rrPending={rrPending}
            hasRoundRobin={rrMatches.length > 0}
          />
        )}
      </div>
    </div>
  );
}

function MatchesTab({ tournamentId, matches }: { tournamentId: string; matches: MatchRow[] }) {
  if (matches.length === 0) {
    return (
      <div className="px-[18px] pt-6 pb-24">
        <div
          className="rounded-2xl bg-white p-5 text-center"
          style={{ border: '1px dashed var(--line)' }}
        >
          <div className="text-[15px] font-semibold text-ink">No matches yet</div>
          <div className="mt-1 text-xs text-ink-3">Add players, then generate the round.</div>
          <Link
            href={`/tournaments/${tournamentId}/invite`}
            className="mt-3 inline-flex items-center gap-1 rounded-full px-4 py-2 text-[13px] font-semibold"
            style={{ background: 'var(--court)', color: 'oklch(0.2 0.04 140)' }}
          >
            Manage roster {Icons.arrow}
          </Link>
        </div>
      </div>
    );
  }

  const byRound = new Map<string, MatchRow[]>();
  for (const row of matches) {
    const key = row.round_label ?? 'Round';
    const list = byRound.get(key) ?? [];
    list.push(row);
    byRound.set(key, list);
  }
  const rounds = [...byRound.keys()].sort().reverse();

  return (
    <div className="py-3.5 pb-24">
      {rounds.map((r) => {
        const list = byRound.get(r) ?? [];
        const done = list.filter((x) => x.completed_at).length;
        return (
          <div key={r} className="mb-[18px]">
            <div className="flex items-baseline justify-between px-[18px] py-2">
              <div className="serif text-[22px] text-ink">{r}</div>
              <div className="text-[11px] tracking-[0.04em] text-ink-3">{done}/{list.length} DONE</div>
            </div>
            <div className="grid gap-2.5 px-[18px]">
              {list.map((row) => (
                <RealMatchCard key={row.id} tournamentId={tournamentId} row={row} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RealMatchCard({ tournamentId, row }: { tournamentId: string; row: MatchRow }) {
  const a = playersFromLabel(row.team_a_label);
  const b = playersFromLabel(row.team_b_label);
  const scoreA = row.team_a_score ?? 0;
  const scoreB = row.team_b_score ?? 0;
  const isDone = !!row.completed_at;
  const isLive = !isDone && (scoreA > 0 || scoreB > 0);
  const aWins = scoreA > scoreB;

  return (
    <Link
      href={`/tournaments/${tournamentId}/match/${row.id}`}
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
      <TeamLineSimple a={a} score={scoreA} winning={isDone && aWins} live={isLive && aWins} />
      <div className="my-1.5 h-px" style={{ background: 'var(--line)' }} />
      <TeamLineSimple a={b} score={scoreB} winning={isDone && !aWins} live={isLive && !aWins} />
    </Link>
  );
}

function TeamLineSimple({
  a,
  score,
  winning,
  live,
}: {
  a: ReturnType<typeof playersFromLabel>;
  score: number;
  winning?: boolean;
  live?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5 px-0.5 py-1">
      <div className="flex">
        <Avatar player={a[0]} size={26} />
        {a[1] && (
          <div className="-ml-2">
            <Avatar player={a[1]} size={26} />
          </div>
        )}
      </div>
      <div
        className="min-w-0 flex-1 text-[13px]"
        style={{ fontWeight: winning ? 600 : 500, color: winning ? 'var(--ink)' : 'var(--ink-2)' }}
      >
        {a.map((p) => p?.name?.split(' ')[0]).filter(Boolean).join(' & ')}
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

function playersFromLabel(label: string) {
  // Labels are stored as "Alice & Bob" or just "Alice".
  const parts = label.split(/\s*&\s*|\s*\/\s*/).filter(Boolean);
  return parts.slice(0, 2).map(playerFromName);
}

function StandingsTab() {
  const sorted = [...SAMPLE_PLAYERS].sort(
    (a, b) => b.wins / (b.wins + b.losses) - a.wins / (a.wins + a.losses) || b.pd - a.pd,
  );
  const leader = sorted[0];

  return (
    <div className="py-3.5 pb-24">
      <div className="px-[18px] pb-[18px]">
        <div
          className="relative overflow-hidden rounded-[22px] p-4"
          style={{ background: 'linear-gradient(135deg, var(--court), oklch(0.85 0.15 145))' }}
        >
          <div className="flex items-center gap-3.5">
            <div className="relative">
              <Avatar player={leader} size={64} ring />
              <div
                className="absolute -bottom-1 -right-1 flex h-[26px] w-[26px] items-center justify-center rounded-full text-[11px] font-bold"
                style={{ background: 'var(--ink)', color: 'var(--court)', border: '2px solid var(--court)' }}
              >
                1
              </div>
            </div>
            <div className="flex-1">
              <div className="text-[11px] tracking-[0.06em]" style={{ color: 'oklch(0.25 0.04 140)' }}>
                LEADER
              </div>
              <div className="serif mt-0.5 text-[22px] leading-[1.1] text-ink">{leader.name}</div>
              <div className="mt-1.5 flex gap-3 text-[11px]" style={{ color: 'oklch(0.3 0.05 140)' }}>
                <span className="flex items-center gap-1"><span style={{ color: 'var(--berry)' }}>{Icons.flame}</span> 4 win streak</span>
                <span>+{leader.pd} pt diff</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-2 px-[18px] pb-2">
        <Chip tone="dark">PLAYERS</Chip>
        <Chip tone="ghost">TEAMS</Chip>
        <Chip tone="ghost">DIVISIONS</Chip>
      </div>

      <div className="px-[18px]">
        <div
          className="grid items-center px-1 pb-2 pt-2.5 text-[10px] uppercase tracking-[0.08em] text-ink-3"
          style={{ gridTemplateColumns: '24px 1fr 50px 50px 50px', borderBottom: '1px solid var(--line)' }}
        >
          <div>#</div>
          <div>PLAYER</div>
          <div className="text-right">W–L</div>
          <div className="text-right">PD</div>
          <div className="text-right">WIN%</div>
        </div>
        {sorted.map((p, i) => {
          const winPct = Math.round((p.wins / (p.wins + p.losses)) * 100);
          return (
            <div
              key={p.id}
              className="grid items-center px-1 py-2.5"
              style={{ gridTemplateColumns: '24px 1fr 50px 50px 50px', borderBottom: '1px solid var(--line)' }}
            >
              <div className="text-[13px] font-semibold text-ink-3">{i + 1}</div>
              <div className="flex items-center gap-2.5">
                <Avatar player={p} size={32} />
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-semibold text-ink">{p.name}</div>
                  <div className="text-[10.5px] text-ink-3">DUPR {p.dupr.toFixed(2)}</div>
                </div>
              </div>
              <div className="mono text-right text-[13px] font-semibold text-ink">{p.wins}–{p.losses}</div>
              <div
                className="mono text-right text-[13px] font-semibold"
                style={{ color: p.pd > 0 ? 'var(--court-deep)' : p.pd < 0 ? 'var(--berry)' : 'var(--ink-3)' }}
              >
                {p.pd > 0 ? '+' : ''}{p.pd}
              </div>
              <div className="mono text-right text-[13px] text-ink-2">{winPct}%</div>
            </div>
          );
        })}
      </div>

      <div className="px-[18px] pt-3.5 text-[11px] leading-[1.5] text-ink-3">
        Sorted by win % → point differential → head-to-head.
      </div>
    </div>
  );
}

function BracketTab({
  tournamentId,
  playoffMatches,
  canGenerate,
  rrPending,
  hasRoundRobin,
}: {
  tournamentId: string;
  playoffMatches: MatchRow[];
  canGenerate: boolean;
  rrPending: number;
  hasRoundRobin: boolean;
}) {
  // Empty state — round robin still in progress, or no schedule yet.
  if (playoffMatches.length === 0) {
    return (
      <div className="py-[18px] pb-24">
        <div className="px-[18px] pb-3.5">
          <div className="serif text-[22px] text-ink">Playoffs</div>
          <div className="mt-0.5 text-xs text-ink-3">
            Top 4 seeds advance after round robin.
          </div>
        </div>

        <div className="px-[18px]">
          {!hasRoundRobin ? (
            <div
              className="rounded-2xl bg-white p-5 text-center text-sm text-ink-3"
              style={{ border: '1px dashed var(--line)' }}
            >
              Generate your round-robin matches first — the bracket gets seeded
              from the standings once everyone has played.
            </div>
          ) : !canGenerate ? (
            <div
              className="rounded-2xl bg-white p-5 text-center"
              style={{ border: '1px dashed var(--line)' }}
            >
              <div className="text-[15px] font-semibold text-ink">
                Round robin in progress
              </div>
              <div className="mt-1 text-xs text-ink-3">
                {rrPending} match{rrPending === 1 ? '' : 'es'} still pending. Once
                they&rsquo;re all scored, you can seed the bracket.
              </div>
            </div>
          ) : (
            <GeneratePlayoffsForm tournamentId={tournamentId} />
          )}

          {/* Sample preview (faded) so the layout is visible on cold pools. */}
          <div className="mt-6 opacity-40">
            <BracketRound
              title="Preview"
              matches={[
                {
                  seed1: '1',
                  p1: SAMPLE_PLAYERS[0],
                  team1Label: SAMPLE_PLAYERS[0].name,
                  seed2: '4',
                  p2: SAMPLE_PLAYERS[3],
                  team2Label: SAMPLE_PLAYERS[3].name,
                },
                {
                  seed1: '2',
                  p1: SAMPLE_PLAYERS[1],
                  team1Label: SAMPLE_PLAYERS[1].name,
                  seed2: '3',
                  p2: SAMPLE_PLAYERS[2],
                  team2Label: SAMPLE_PLAYERS[2].name,
                },
              ]}
            />
            <BracketConnector />
            <BracketRound
              title="Final"
              matches={[
                {
                  seed1: '?',
                  p1: null,
                  team1Label: 'TBD',
                  seed2: '?',
                  p2: null,
                  team2Label: 'TBD',
                  isFinal: true,
                },
              ]}
            />
          </div>
        </div>
      </div>
    );
  }

  const semi1 = playoffMatches.find((m) => m.round_label === PLAYOFF_ROUND_LABELS.semi1);
  const semi2 = playoffMatches.find((m) => m.round_label === PLAYOFF_ROUND_LABELS.semi2);
  const final = playoffMatches.find((m) => m.round_label === PLAYOFF_ROUND_LABELS.final);
  const bronze = playoffMatches.find((m) => m.round_label === PLAYOFF_ROUND_LABELS.bronze);

  return (
    <div className="py-[18px] pb-24">
      <div className="px-[18px] pb-3.5">
        <div className="serif text-[22px] text-ink">Playoffs</div>
        <div className="mt-0.5 text-xs text-ink-3">
          Tap a match to score it. Final &amp; 3rd-place fill in as the semis finish.
        </div>
      </div>

      <div className="px-[18px]">
        <BracketRound
          title="Semifinals"
          matches={[
            bracketMatchFromRow(tournamentId, semi1, '1'),
            bracketMatchFromRow(tournamentId, semi2, '2'),
          ]}
        />
        <BracketConnector />
        <BracketRound
          title="Final"
          matches={[bracketMatchFromRow(tournamentId, final, '🏆', { gold: true })]}
        />
        {bronze && (
          <BracketRound
            title="3rd place"
            matches={[bracketMatchFromRow(tournamentId, bronze, '🥉')]}
          />
        )}
      </div>
    </div>
  );
}

function BracketConnector() {
  return (
    <div className="relative h-2">
      <svg
        className="absolute -top-1 h-10 w-full"
        viewBox="0 0 100 40"
        preserveAspectRatio="none"
      >
        <path d="M20 0 V20 H80 V40" stroke="var(--line)" strokeWidth="1" fill="none" strokeDasharray="2 3" />
      </svg>
    </div>
  );
}

const SEMI_PLACEHOLDER_VALUES = new Set<string>([
  ...Object.values(SEMI_WINNER_PLACEHOLDERS),
  ...Object.values(SEMI_LOSER_PLACEHOLDERS),
]);

import type { AvatarPlayer } from '@/components/ui/Avatar';

type BracketMatch = {
  href?: string;
  seed1: string;
  p1: AvatarPlayer | null;
  team1Label: string;
  score1?: number | null;
  winner1?: boolean;
  seed2: string;
  p2: AvatarPlayer | null;
  team2Label: string;
  score2?: number | null;
  winner2?: boolean;
  isFinal?: boolean;
};

function bracketMatchFromRow(
  tournamentId: string,
  row: MatchRow | undefined,
  seedBadge: string,
  opts: { gold?: boolean } = {},
): BracketMatch {
  if (!row) {
    return {
      seed1: seedBadge,
      p1: null,
      team1Label: 'TBD',
      seed2: seedBadge,
      p2: null,
      team2Label: 'TBD',
      isFinal: !!opts.gold,
    };
  }

  const isPending =
    SEMI_PLACEHOLDER_VALUES.has(row.team_a_label) || SEMI_PLACEHOLDER_VALUES.has(row.team_b_label);
  const isDone = !!row.completed_at;
  const aWins = isDone && (row.team_a_score ?? 0) > (row.team_b_score ?? 0);
  const bWins = isDone && (row.team_b_score ?? 0) > (row.team_a_score ?? 0);

  return {
    href: !isPending ? `/tournaments/${tournamentId}/match/${row.id}` : undefined,
    seed1: seedBadge,
    p1: SEMI_PLACEHOLDER_VALUES.has(row.team_a_label) ? null : firstAvatar(row.team_a_label),
    team1Label: row.team_a_label,
    score1: row.team_a_score,
    winner1: aWins,
    seed2: seedBadge,
    p2: SEMI_PLACEHOLDER_VALUES.has(row.team_b_label) ? null : firstAvatar(row.team_b_label),
    team2Label: row.team_b_label,
    score2: row.team_b_score,
    winner2: bWins,
    isFinal: !!opts.gold,
  };
}

function firstAvatar(label: string) {
  const first = label.split(/\s*&\s*|\s*\/\s*/)[0]?.trim();
  if (!first) return null;
  return playerFromName(first);
}

function BracketRound({ title, matches }: { title: string; matches: BracketMatch[] }) {
  return (
    <div className="mb-3.5">
      <div className="mb-2 text-[11px] tracking-[0.08em] text-ink-3">{title.toUpperCase()}</div>
      <div className="grid gap-2">
        {matches.map((m, i) => {
          const card = (
            <div
              className="relative overflow-hidden rounded-2xl p-3"
              style={{
                background: m.isFinal ? 'var(--ink)' : '#fff',
                color: m.isFinal ? 'var(--paper)' : 'var(--ink)',
                border: `1px solid ${m.isFinal ? 'var(--ink)' : 'var(--line)'}`,
              }}
            >
              {m.isFinal && (
                <div className="absolute right-3 top-2" style={{ color: 'var(--court)' }}>
                  {Icons.trophy}
                </div>
              )}
              <BracketLine
                seed={m.seed1}
                p={m.p1}
                label={m.team1Label}
                score={m.score1}
                winner={m.winner1}
                dim={m.isFinal}
              />
              <div
                className="my-1.5 h-px"
                style={{ background: m.isFinal ? 'oklch(0.28 0.02 100)' : 'var(--line)' }}
              />
              <BracketLine
                seed={m.seed2}
                p={m.p2}
                label={m.team2Label}
                score={m.score2}
                winner={m.winner2}
                dim={m.isFinal}
              />
            </div>
          );
          return m.href ? (
            <Link key={i} href={m.href} className="block">
              {card}
            </Link>
          ) : (
            <div key={i}>{card}</div>
          );
        })}
      </div>
    </div>
  );
}

function BracketLine({
  seed,
  p,
  label,
  score,
  winner,
  dim,
}: {
  seed: string;
  p: AvatarPlayer | null;
  label: string;
  score?: number | null;
  winner?: boolean;
  dim?: boolean;
}) {
  const isTBD = label === 'TBD' || label === '' || !label;
  return (
    <div className="flex items-center gap-2.5 px-0.5 py-1">
      <div
        className="mono w-3.5 text-[11px]"
        style={{ color: dim ? 'oklch(0.6 0.02 100)' : 'var(--ink-3)' }}
      >
        {seed}
      </div>
      {p ? (
        <Avatar player={p} size={24} />
      ) : (
        <div
          className="h-6 w-6 rounded-full"
          style={{ background: dim ? 'oklch(0.28 0.02 100)' : 'var(--paper-2)' }}
        />
      )}
      <div
        className="flex-1 truncate text-[13px] font-semibold"
        style={{
          color: isTBD
            ? dim
              ? 'oklch(0.6 0.02 100)'
              : 'var(--ink-3)'
            : winner
              ? dim
                ? 'var(--court)'
                : 'var(--court-deep)'
              : 'inherit',
        }}
      >
        {isTBD ? 'TBD' : label}
      </div>
      {score != null && (
        <div
          className="mono text-[14px] font-bold"
          style={{ color: winner ? (dim ? 'var(--court)' : 'var(--court-deep)') : 'inherit' }}
        >
          {score}
        </div>
      )}
    </div>
  );
}

