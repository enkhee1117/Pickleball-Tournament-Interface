import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Tournament } from '@/lib/types';
import { TopBar } from '@/components/ui/TopBar';
import { Chip } from '@/components/ui/Chip';
import { Avatar, playerFromName } from '@/components/ui/Avatar';
import { Icons } from '@/components/ui/icons';

type LinkedRow = { id: string; tournament_id: string; display_name: string };
type Match = {
  id: string;
  round_label: string | null;
  court_label: string | null;
  team_a_label: string;
  team_b_label: string;
  team_a_score: number | null;
  team_b_score: number | null;
  winner_side: 'a' | 'b' | null;
  completed_at: string | null;
  recording_url: string | null;
};

export default async function PlayerTournamentHistoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return notFound();
  }

  const [{ data: linked }, { data: tournament }, { data: matchRows }] = await Promise.all([
    supabase
      .from('tournament_players')
      .select('id,tournament_id,display_name')
      .eq('profile_id', user.id)
      .eq('tournament_id', id),
    supabase
      .from('tournaments')
      .select('id,owner_user_id,name,format,status,whatsapp_group_url,invite_code,created_at,updated_at')
      .eq('id', id)
      .single(),
    supabase
      .from('matches')
      .select(
        'id,round_label,court_label,team_a_label,team_b_label,team_a_score,team_b_score,winner_side,completed_at,recording_url',
      )
      .eq('tournament_id', id)
      .order('created_at', { ascending: true }),
  ]);

  if (!tournament) return notFound();
  const t = tournament as Tournament;
  const myLinks = (linked ?? []) as LinkedRow[];
  const allMatches = (matchRows ?? []) as Match[];

  const myNames = new Set(myLinks.map((l) => l.display_name));
  const myMatches = allMatches.filter((m) =>
    [m.team_a_label, m.team_b_label]
      .flatMap((label) => label.split(/\s*&\s*|\s*\/\s*/).map((s) => s.trim()))
      .some((name) => myNames.has(name)),
  );

  let played = 0;
  let won = 0;
  let pointsFor = 0;
  let pointsAgainst = 0;
  for (const m of myMatches) {
    if (!m.completed_at || m.winner_side == null) continue;
    played += 1;
    const onA = myNames.size > 0 && parseTeam(m.team_a_label).some((n) => myNames.has(n));
    const myScore = onA ? m.team_a_score ?? 0 : m.team_b_score ?? 0;
    const theirScore = onA ? m.team_b_score ?? 0 : m.team_a_score ?? 0;
    pointsFor += myScore;
    pointsAgainst += theirScore;
    if ((onA && m.winner_side === 'a') || (!onA && m.winner_side === 'b')) won += 1;
  }

  return (
    <div className="flex min-h-full flex-col bg-paper">
      <TopBar
        title={t.name}
        sub={`Your matches · ${myLinks.map((l) => l.display_name).join(' / ') || 'unlinked'}`}
        left={
          <Link
            href="/history"
            aria-label="Back"
            className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{ color: 'var(--ink)' }}
          >
            {Icons.back}
          </Link>
        }
      />

      <div className="flex-1 overflow-y-auto px-[18px] pb-24">
        {myLinks.length === 0 ? (
          <div
            className="mt-3 rounded-2xl bg-white p-4 text-[13px]"
            style={{ border: '1px solid var(--line)', color: 'var(--ink-2)' }}
          >
            <strong>You aren&apos;t linked to a player in this tournament yet.</strong>{' '}
            <Link
              href={`/tournaments/${t.id}/invite`}
              className="font-semibold underline"
              style={{ color: 'var(--ink)' }}
            >
              Pick yourself
            </Link>{' '}
            to start tracking matches here.
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-3 gap-2.5">
            <StatTile label="Played" value={played} />
            <StatTile label="Won" value={won} />
            <StatTile
              label="Pt diff"
              value={`${pointsFor - pointsAgainst >= 0 ? '+' : ''}${pointsFor - pointsAgainst}`}
            />
          </div>
        )}

        <div className="mt-4 mb-2 text-[10px] uppercase tracking-[0.06em] text-ink-3">
          Your matches in {t.name}
        </div>
        {myMatches.length === 0 ? (
          <div
            className="rounded-2xl bg-white p-5 text-center text-sm text-ink-3"
            style={{ border: '1px dashed var(--line)' }}
          >
            No matches yet. Once they&apos;re scored they&apos;ll show up here.
          </div>
        ) : (
          <div className="grid gap-2">
            {myMatches.map((m) => (
              <MyMatchCard key={m.id} tournamentId={t.id} match={m} myNames={myNames} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: number | string }) {
  return (
    <div
      className="rounded-2xl bg-white p-3.5 text-center"
      style={{ border: '1px solid var(--line)' }}
    >
      <div className="mono mt-1 text-[24px] font-bold tracking-tight text-ink">{value}</div>
      <div className="text-[11px] uppercase tracking-[0.04em] text-ink-3">{label}</div>
    </div>
  );
}

function MyMatchCard({
  tournamentId,
  match,
  myNames,
}: {
  tournamentId: string;
  match: Match;
  myNames: Set<string>;
}) {
  const a = parseTeam(match.team_a_label);
  const b = parseTeam(match.team_b_label);
  const scoreA = match.team_a_score ?? 0;
  const scoreB = match.team_b_score ?? 0;
  const isDone = !!match.completed_at;
  const isLive = !isDone && (scoreA > 0 || scoreB > 0);
  const onA = a.some((n) => myNames.has(n));
  const myScore = onA ? scoreA : scoreB;
  const theirScore = onA ? scoreB : scoreA;
  const won = onA ? match.winner_side === 'a' : match.winner_side === 'b';

  return (
    <Link
      href={`/tournaments/${tournamentId}/match/${match.id}`}
      className="block rounded-2xl bg-white p-3"
      style={{ border: '1px solid var(--line)' }}
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-[0.06em] text-ink-3">
          {match.round_label ?? '—'}
          {match.court_label ? ` · ${match.court_label}` : ''}
        </div>
        <div className="flex items-center gap-1.5">
          {match.recording_url && (
            <span
              className="inline-flex h-5 items-center gap-1 rounded-full px-1.5 text-[10px] font-bold text-white"
              style={{
                background: /(?:youtube\.com|youtu\.be)/i.test(match.recording_url) ? '#FF0033' : 'var(--ink)',
              }}
            >
              ▶
            </span>
          )}
          {isDone ? (
            <Chip tone={won ? 'court' : 'ghost'}>{won ? 'WON' : 'LOST'}</Chip>
          ) : isLive ? (
            <Chip tone="live">LIVE</Chip>
          ) : (
            <Chip tone="ghost">UPCOMING</Chip>
          )}
        </div>
      </div>
      <TeamLine players={a} score={scoreA} mine={onA} winning={isDone && match.winner_side === 'a'} />
      <div className="my-1 h-px" style={{ background: 'var(--line)' }} />
      <TeamLine players={b} score={scoreB} mine={!onA} winning={isDone && match.winner_side === 'b'} />
      {isDone && (
        <div
          className="mt-1.5 text-[11px] font-semibold"
          style={{ color: won ? 'var(--court-deep)' : 'var(--berry)' }}
        >
          {won ? 'You won' : 'You lost'} {Math.max(myScore, theirScore)}–{Math.min(myScore, theirScore)}
        </div>
      )}
    </Link>
  );
}

function TeamLine({
  players,
  score,
  mine,
  winning,
}: {
  players: string[];
  score: number;
  mine: boolean;
  winning: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5 py-1">
      <div className="flex">
        <Avatar player={playerFromName(players[0] ?? '?')} size={24} />
        {players[1] && (
          <div className="-ml-2">
            <Avatar player={playerFromName(players[1])} size={24} />
          </div>
        )}
      </div>
      <div
        className="flex-1 truncate text-[13px]"
        style={{ fontWeight: mine || winning ? 600 : 500, color: mine ? 'var(--ink)' : 'var(--ink-2)' }}
      >
        {players.join(' & ')}
        {mine && <span className="ml-1 text-[10px] text-ink-3">(you)</span>}
      </div>
      <div
        className="mono text-[18px] font-bold"
        style={{ color: winning ? 'var(--court-deep)' : 'var(--ink-3)' }}
      >
        {score}
      </div>
    </div>
  );
}

function parseTeam(label: string): string[] {
  return label.split(/\s*&\s*|\s*\/\s*/).map((s) => s.trim()).filter(Boolean);
}
