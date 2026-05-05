import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import type { Tournament } from '@/lib/types';
import { TopBar } from '@/components/ui/TopBar';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Chip } from '@/components/ui/Chip';
import { Avatar, playerFromName } from '@/components/ui/Avatar';
import { Icons } from '@/components/ui/icons';
import { computePlayerStandings, type StandingsMatch } from '@/lib/scoring';

type TournamentMemberRow = {
  role: string;
  tournaments: Tournament | null;
};

type LinkedPlayer = {
  id: string;
  tournament_id: string;
  display_name: string;
};

type MatchRow = {
  id: string;
  tournament_id: string;
  round_label: string | null;
  team_a_label: string;
  team_b_label: string;
  team_a_score: number | null;
  team_b_score: number | null;
  winner_side: 'a' | 'b' | null;
  completed_at: string | null;
  match_games: { team_a_score: number; team_b_score: number }[] | null;
};

export default async function HistoryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="flex min-h-full flex-col bg-paper">
        <TopBar
          title="Stats"
          left={
            <Link
              href="/"
              aria-label="Back"
              className="flex h-10 w-10 items-center justify-center rounded-xl"
              style={{ color: 'var(--ink)' }}
            >
              {Icons.back}
            </Link>
          }
        />
        <div className="flex flex-1 flex-col items-center justify-center px-[18px] pb-24 text-center">
          <div className="serif text-[28px] leading-[1.1] text-ink">
            Sign in to see <span className="italic" style={{ color: 'var(--court-deep)' }}>your stats</span>.
          </div>
          <Link
            href="/login?next=/history"
            className="mt-6 rounded-xl px-5 py-2.5 text-[13px] font-semibold"
            style={{ background: 'var(--ink)', color: 'var(--paper)' }}
          >
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  const [{ data: linkedPlayers }, { data: memberRows }] = await Promise.all([
    supabase
      .from('tournament_players')
      .select('id,tournament_id,display_name')
      .eq('profile_id', user.id),
    supabase
      .from('tournament_members')
      .select('role,tournaments(*)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
  ]);

  const linked = (linkedPlayers ?? []) as LinkedPlayer[];
  const tournamentIds = Array.from(new Set(linked.map((p) => p.tournament_id)));

  let myMatches: MatchRow[] = [];
  let tournamentsById = new Map<string, Tournament>();

  if (tournamentIds.length > 0) {
    const [{ data: matchRows }, { data: tournamentRows }] = await Promise.all([
      supabase
        .from('matches')
        .select(
          'id,tournament_id,round_label,team_a_label,team_b_label,team_a_score,team_b_score,winner_side,completed_at,match_games(team_a_score,team_b_score)',
        )
        .in('tournament_id', tournamentIds)
        .not('completed_at', 'is', null),
      supabase
        .from('tournaments')
        .select('id,owner_user_id,name,format,status,whatsapp_group_url,invite_code,created_at,updated_at')
        .in('id', tournamentIds),
    ]);
    myMatches = ((matchRows ?? []) as MatchRow[]).filter((row) => {
      const linkedNames = linked
        .filter((lp) => lp.tournament_id === row.tournament_id)
        .map((lp) => lp.display_name);
      return linkedNames.some((name) => labelHasPlayer(row.team_a_label, name) || labelHasPlayer(row.team_b_label, name));
    });
    tournamentsById = new Map(((tournamentRows ?? []) as Tournament[]).map((t) => [t.id, t]));
  }

  const allTournaments = ((memberRows as TournamentMemberRow[] | null) ?? [])
    .map((r) => r.tournaments)
    .filter((t): t is Tournament => !!t);
  const past = allTournaments.filter((t) => t.status === 'completed' || t.status === 'archived');
  const unclaimed = allTournaments.filter(
    (t) => !linked.some((p) => p.tournament_id === t.id),
  );

  const aggregate = aggregateStats(myMatches, linked);

  return (
    <div className="flex min-h-full flex-col bg-paper">
      <TopBar
        title="Stats"
        left={
          <Link
            href="/"
            aria-label="Back"
            className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{ color: 'var(--ink)' }}
          >
            {Icons.back}
          </Link>
        }
      />

      <div className="flex-1 overflow-y-auto px-[18px] pb-24">
        <div className="serif px-1 py-2 text-[28px] leading-[1.1] text-ink">
          Your <span className="italic" style={{ color: 'var(--court-deep)' }}>scorecard</span>
          .
        </div>

        {linked.length === 0 ? (
          <div
            className="mb-4 rounded-2xl bg-white p-4 text-[13px]"
            style={{ border: '1px solid var(--line)', color: 'var(--ink-2)' }}
          >
            <strong>Nothing linked yet.</strong> Pick which player you are on each
            tournament&apos;s roster page to start tracking your matches here.
            {unclaimed.length > 0 && (
              <div className="mt-2.5 grid gap-1.5">
                {unclaimed.slice(0, 5).map((t) => (
                  <Link
                    key={t.id}
                    href={`/tournaments/${t.id}/invite`}
                    className="block rounded-xl px-3 py-2 text-[12px] font-semibold"
                    style={{ background: 'var(--paper-2)', color: 'var(--ink)' }}
                  >
                    Pick yourself in {t.name} →
                  </Link>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="mb-[22px] grid grid-cols-3 gap-2.5">
            <StatTile label="Played" value={aggregate.matchesPlayed} icon="🎾" />
            <StatTile label="Won" value={aggregate.wins} icon="🏆" />
            <StatTile label="Win %" value={aggregate.winPct === null ? '—' : `${aggregate.winPct}%`} icon="📈" />
          </div>
        )}

        {linked.length > 0 && aggregate.matchesPlayed > 0 && (
          <>
            <SectionHeader title="By tournament" />
            <div className="mb-[18px] grid gap-2.5">
              {aggregate.perTournament.map(({ tournamentId, displayName, row }) => {
                const t = tournamentsById.get(tournamentId);
                if (!t) return null;
                return (
                  <Link
                    key={tournamentId}
                    href={`/tournaments/${tournamentId}?tab=standings`}
                    className="block rounded-2xl bg-white p-3.5"
                    style={{ border: '1px solid var(--line)' }}
                  >
                    <div className="flex items-center gap-3">
                      <Avatar player={playerFromName(displayName)} size={36} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14px] font-semibold tracking-tight text-ink">
                          {t.name}
                        </div>
                        <div className="text-[11px] text-ink-3">
                          As {displayName} · {row.matchesPlayed} match
                          {row.matchesPlayed === 1 ? '' : 'es'}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="mono text-[14px] font-bold text-ink">
                          {row.matchWins}–{row.matchLosses}
                        </div>
                        <div
                          className="mono text-[11px]"
                          style={{
                            color:
                              row.pointDiff > 0
                                ? 'var(--court-deep)'
                                : row.pointDiff < 0
                                  ? 'var(--berry)'
                                  : 'var(--ink-3)',
                          }}
                        >
                          {row.pointDiff > 0 ? '+' : ''}
                          {row.pointDiff} pt
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </>
        )}

        <SectionHeader title="Past tournaments" />
        {past.length === 0 ? (
          <div
            className="rounded-2xl bg-white p-5 text-center text-sm text-ink-3"
            style={{ border: '1px dashed var(--line)' }}
          >
            Nothing in the books yet. Finish a tournament to see it here.
          </div>
        ) : (
          <div className="relative pl-6">
            <div
              className="absolute bottom-2 top-2 left-[9px] w-[1.5px]"
              style={{ background: 'var(--line)' }}
            />
            {past.map((t) => {
              const date = new Date(t.created_at).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
              });
              return (
                <div key={t.id} className="relative mb-3.5">
                  <div
                    className="absolute -left-5 top-3.5 h-3.5 w-3.5 rounded-full"
                    style={{
                      background: 'var(--paper)',
                      border: '2px solid var(--ink-3)',
                    }}
                  />
                  <Link
                    href={`/tournaments/${t.id}`}
                    className="block rounded-2xl bg-white p-3.5"
                    style={{ border: '1px solid var(--line)' }}
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <div className="text-[11px] uppercase tracking-[0.04em] text-ink-3">
                        {date} · {t.format}
                      </div>
                      {t.status === 'completed' && <Chip tone="ghost">DONE</Chip>}
                    </div>
                    <div className="text-[15px] font-semibold tracking-tight text-ink">{t.name}</div>
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function StatTile({ label, value, icon }: { label: string; value: number | string; icon: string }) {
  return (
    <div
      className="rounded-2xl bg-white p-3.5 text-center"
      style={{ border: '1px solid var(--line)' }}
    >
      <div className="text-[28px]">{icon}</div>
      <div className="mono mt-1 text-[22px] font-bold tracking-tight text-ink">{value}</div>
      <div className="text-[11px] uppercase tracking-[0.04em] text-ink-3">{label}</div>
    </div>
  );
}

function labelHasPlayer(label: string, name: string): boolean {
  // Team labels look like "Alice & Bob" or "Alice / Bob"; match exact splits.
  return label
    .split(/\s*&\s*|\s*\/\s*/)
    .map((s) => s.trim())
    .includes(name);
}

function aggregateStats(matches: MatchRow[], linked: LinkedPlayer[]) {
  const linkedById = new Map<string, LinkedPlayer[]>();
  for (const lp of linked) {
    const list = linkedById.get(lp.tournament_id) ?? [];
    list.push(lp);
    linkedById.set(lp.tournament_id, list);
  }

  // For each tournament, build StandingsMatch[] from this user's perspective
  // and run computePlayerStandings to get their personal row.
  const perTournament: Array<{
    tournamentId: string;
    displayName: string;
    row: ReturnType<typeof computePlayerStandings>[number];
  }> = [];

  let matchesPlayed = 0;
  let wins = 0;

  const byTournament = new Map<string, MatchRow[]>();
  for (const m of matches) {
    const list = byTournament.get(m.tournament_id) ?? [];
    list.push(m);
    byTournament.set(m.tournament_id, list);
  }

  for (const [tournamentId, tMatches] of byTournament) {
    const myPlayers = linkedById.get(tournamentId) ?? [];
    if (myPlayers.length === 0) continue;
    const myName = myPlayers[0].display_name;

    const standingsMatches: StandingsMatch[] = tMatches.map((row) => {
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

    const standings = computePlayerStandings(standingsMatches);
    const me = standings.find((r) => r.team === myName);
    if (!me) continue;
    perTournament.push({ tournamentId, displayName: myName, row: me });
    matchesPlayed += me.matchesPlayed;
    wins += me.matchWins;
  }

  perTournament.sort((a, b) => b.row.matchesPlayed - a.row.matchesPlayed);

  return {
    matchesPlayed,
    wins,
    winPct: matchesPlayed === 0 ? null : Math.round((wins / matchesPlayed) * 100),
    perTournament,
  };
}
