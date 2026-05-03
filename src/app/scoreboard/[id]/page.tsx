import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { GenerateMatchesForm } from '@/app/tournaments/_components/GenerateMatchesForm';
import { EditMatchForm } from '@/app/tournaments/_components/EditMatchForm';
import { ScoreMatchForm, type GameInput } from '@/app/tournaments/_components/ScoreMatchForm';
import {
  computePlayerStandings,
  computeStandings,
  isRotatingPartnersData,
  type StandingRow,
  type StandingsMatch,
} from '@/lib/scoring';

type DivisionRow = {
  id: string;
  name: string;
  best_of: 1 | 3 | 5;
  target_score: 11 | 15 | 21;
  win_by: 1 | 2;
};

type MatchRow = {
  id: string;
  division_id: string | null;
  round_label: string | null;
  court_label: string | null;
  team_a_label: string;
  team_b_label: string;
  team_a_score: number | null;
  team_b_score: number | null;
  winner_side: 'a' | 'b' | null;
  completed_at: string | null;
  match_games: { game_no: number; team_a_score: number; team_b_score: number }[] | null;
};

const DEFAULT_RULES = { best_of: 1 as const, target_score: 11 as const, win_by: 2 as const };

export default async function TournamentScoreboard({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [
    { data: tournament },
    { data: divisions },
    { data: matches },
    { data: players },
    { data: userData },
  ] = await Promise.all([
    supabase.from('tournaments').select('id,name,format,status').eq('id', id).single(),
    supabase
      .from('divisions')
      .select('id,name,best_of,target_score,win_by')
      .eq('tournament_id', id)
      .order('created_at', { ascending: true }),
    supabase
      .from('matches')
      .select(
        'id,division_id,round_label,court_label,team_a_label,team_b_label,team_a_score,team_b_score,winner_side,completed_at,match_games(game_no,team_a_score,team_b_score)',
      )
      .eq('tournament_id', id)
      .order('created_at', { ascending: true }),
    supabase
      .from('tournament_players')
      .select('id,division_id')
      .eq('tournament_id', id),
    supabase.auth.getUser(),
  ]);

  if (!tournament) notFound();

  const meId = userData.user?.id;
  let canManage = false;
  if (meId) {
    const { data: member } = await supabase
      .from('tournament_members')
      .select('role')
      .eq('tournament_id', id)
      .eq('user_id', meId)
      .single();
    canManage = !!member && (member.role === 'owner' || member.role === 'organizer');
  }

  const dvs = (divisions ?? []) as DivisionRow[];
  const m = (matches ?? []) as MatchRow[];
  const ps = (players ?? []) as { id: string; division_id: string | null }[];

  // Counts the form needs to render the wipe-confirm warning.
  const openPending = m.filter((row) => row.division_id === null && !row.completed_at).length;
  const pendingByDivision = new Map<string, number>();
  for (const row of m) {
    if (row.completed_at || row.division_id === null) continue;
    pendingByDivision.set(row.division_id, (pendingByDivision.get(row.division_id) ?? 0) + 1);
  }
  const playersByDivision = new Map<string, number>();
  let openPlayers = 0;
  for (const player of ps) {
    if (player.division_id) {
      playersByDivision.set(
        player.division_id,
        (playersByDivision.get(player.division_id) ?? 0) + 1,
      );
    } else {
      openPlayers += 1;
    }
  }
  const divisionsForGenerate = dvs.map((d) => ({
    id: d.id,
    name: d.name,
    assignedPlayers: playersByDivision.get(d.id) ?? 0,
    pendingMatches: pendingByDivision.get(d.id) ?? 0,
  }));

  const groupKeys: (string | null)[] = [];
  if (m.some((row) => row.division_id === null)) groupKeys.push(null);
  for (const d of dvs) {
    if (m.some((row) => row.division_id === d.id)) groupKeys.push(d.id);
  }

  const rulesFor = (divisionId: string | null) => {
    if (!divisionId) return DEFAULT_RULES;
    const d = dvs.find((dd) => dd.id === divisionId);
    if (!d) return DEFAULT_RULES;
    return { best_of: d.best_of, target_score: d.target_score, win_by: d.win_by };
  };
  const nameFor = (divisionId: string | null) =>
    divisionId ? dvs.find((d) => d.id === divisionId)?.name ?? 'Division' : 'Open / unassigned';

  return (
    <div className="space-y-6">
      <section className="card p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-volt">Scoreboard</p>
            <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">{tournament.name}</h1>
            <p className="mt-1 text-sm text-text-muted">
              {tournament.status} - {dvs.length} division{dvs.length === 1 ? '' : 's'} - {m.length} match
              {m.length === 1 ? '' : 'es'}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link href="/scoreboard" className="btn btn-ghost">
              All scoreboards
            </Link>
            <Link href={`/tournaments/${id}`} className="btn btn-ghost">
              Setup
            </Link>
          </div>
        </div>
      </section>

      {canManage && (
        <details className="card group" {...(groupKeys.length === 0 ? { open: true } : {})}>
          <summary className="cursor-pointer list-none">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-xl font-semibold">Generate matches</h2>
                <p className="text-xs text-text-muted">
                  Build a schedule from your roster. Only unscored matches are touched - completed
                  results are safe.
                </p>
              </div>
              <span className="text-xs text-text-muted group-open:hidden">expand</span>
              <span className="hidden text-xs text-text-muted group-open:inline">collapse</span>
            </div>
          </summary>
          <div className="mt-4">
            <GenerateMatchesForm
              tournamentId={id}
              playerCount={ps.length}
              openDivisionPlayerCount={openPlayers}
              openPendingMatches={openPending}
              divisions={divisionsForGenerate}
            />
          </div>
        </details>
      )}

      {groupKeys.length === 0 && (
        <section className="card p-6 text-center">
          <p className="text-sm text-text-muted">
            No matches yet.{' '}
            {canManage ? 'Open the Generate matches panel above.' : 'Check back once an organizer schedules a round.'}
          </p>
        </section>
      )}

      {groupKeys.map((divisionId) => {
        const rules = rulesFor(divisionId);
        const groupMatches = m.filter((row) => row.division_id === divisionId);
        const inProgress = groupMatches.filter((row) => !row.completed_at);
        const completed = groupMatches.filter((row) => row.completed_at);

        const standingsInput: StandingsMatch[] = completed.map((row) => {
          const games = (row.match_games ?? []).sort((a, b) => a.game_no - b.game_no);
          let games_won_a = 0;
          let games_won_b = 0;
          for (const g of games) {
            if (
              (g.team_a_score >= rules.target_score || g.team_b_score >= rules.target_score) &&
              Math.abs(g.team_a_score - g.team_b_score) >= rules.win_by
            ) {
              if (g.team_a_score > g.team_b_score) games_won_a += 1;
              else games_won_b += 1;
            }
          }
          if (games.length === 0 && row.winner_side) {
            if (row.winner_side === 'a') games_won_a = 1;
            else games_won_b = 1;
          }
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
        const teamStandings = computeStandings(standingsInput);
        const playerStandings = computePlayerStandings(standingsInput);
        const isRotating = isRotatingPartnersData(standingsInput);

        return (
          <section key={divisionId ?? 'open'} className="space-y-4">
            <div className="card">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-display text-xl font-semibold">{nameFor(divisionId)}</h2>
                  <p className="text-xs text-text-muted">
                    Best of {rules.best_of} to {rules.target_score} (win by {rules.win_by}) -{' '}
                    {inProgress.length} live, {completed.length} final
                  </p>
                </div>
              </div>

              {inProgress.length === 0 ? (
                <p className="text-sm text-text-muted">No active matches in this division.</p>
              ) : (
                <ul className="grid gap-3 md:grid-cols-2">
                  {inProgress.map((match) => {
                    const games: GameInput[] = (match.match_games ?? [])
                      .sort((a, b) => a.game_no - b.game_no)
                      .map((g) => ({ team_a_score: g.team_a_score, team_b_score: g.team_b_score }));
                    return (
                      <li key={match.id} className="rounded-lg border border-border-dark bg-dark-bg p-3">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs uppercase tracking-wider text-text-muted">
                            {match.round_label ?? 'Round'} - {match.court_label ?? 'Court'}
                          </p>
                          {canManage && (
                            <EditMatchForm
                              tournamentId={id}
                              matchId={match.id}
                              defaultTeamA={match.team_a_label}
                              defaultTeamB={match.team_b_label}
                              defaultRound={match.round_label ?? ''}
                              defaultCourt={match.court_label ?? ''}
                            />
                          )}
                        </div>
                        <div className="mt-2 space-y-1">
                          <p className="font-medium">{match.team_a_label}</p>
                          <p className="font-medium">{match.team_b_label}</p>
                        </div>
                        {canManage && (
                          <div className="mt-3 border-t border-border-dark pt-3">
                            <ScoreMatchForm
                              tournamentId={id}
                              matchId={match.id}
                              bestOf={rules.best_of}
                              targetScore={rules.target_score}
                              winBy={rules.win_by}
                              defaultGames={games}
                            />
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
              <div className="card">
                <h3 className="mb-3 font-display text-lg font-semibold">Recent results</h3>
                {completed.length === 0 ? (
                  <p className="text-sm text-text-muted">No completed matches yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {completed
                      .slice(-30)
                      .reverse()
                      .map((match) => (
                        <li
                          key={match.id}
                          className="rounded-md border border-border-dark bg-dark-bg px-3 py-2"
                        >
                          <p className="text-xs uppercase tracking-wider text-text-muted">
                            {match.round_label ?? 'Round'} - {match.court_label ?? 'Court'}
                          </p>
                          <div className="mt-1 grid grid-cols-[1fr_auto_auto] items-center gap-2">
                            <span
                              className={
                                match.winner_side === 'a' ? 'font-bold text-volt' : 'text-text-muted'
                              }
                            >
                              {match.team_a_label}
                            </span>
                            <span className="font-display text-base font-bold tabular-nums">
                              {(match.match_games ?? [])
                                .sort((a, b) => a.game_no - b.game_no)
                                .map((g) => `${g.team_a_score}-${g.team_b_score}`)
                                .join(', ') || `${match.team_a_score ?? '?'}-${match.team_b_score ?? '?'}`}
                            </span>
                            <span
                              className={
                                match.winner_side === 'a'
                                  ? 'text-xs font-bold text-volt'
                                  : 'text-xs text-text-muted'
                              }
                            >
                              {match.winner_side === 'a' ? 'W' : 'L'}
                            </span>
                            <span
                              className={
                                match.winner_side === 'b' ? 'font-bold text-volt' : 'text-text-muted'
                              }
                            >
                              {match.team_b_label}
                            </span>
                            <span />
                            <span
                              className={
                                match.winner_side === 'b'
                                  ? 'text-xs font-bold text-volt'
                                  : 'text-xs text-text-muted'
                              }
                            >
                              {match.winner_side === 'b' ? 'W' : 'L'}
                            </span>
                          </div>
                        </li>
                      ))}
                  </ul>
                )}
              </div>

              <div className="space-y-4">
                <StandingsTable
                  title={isRotating ? 'Player standings' : 'Team standings'}
                  rows={isRotating ? playerStandings : teamStandings}
                  primary
                />
                {teamStandings.length > 0 && playerStandings.length > 0 && (
                  <StandingsTable
                    title={isRotating ? 'Team standings' : 'Player standings'}
                    rows={isRotating ? teamStandings : playerStandings}
                    primary={false}
                  />
                )}
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function StandingsTable({
  title,
  rows,
  primary,
}: {
  title: string;
  rows: StandingRow[];
  primary: boolean;
}) {
  return (
    <div className={primary ? 'card' : 'card opacity-90'}>
      <h3 className="mb-3 font-display text-lg font-semibold">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-text-muted">Appears once matches finish.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-text-muted">
            <tr>
              <th className="py-1">#</th>
              <th>{title.includes('Player') ? 'Player' : 'Team'}</th>
              <th className="text-right">W-L</th>
              <th className="text-right">PD</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={row.team} className="border-t border-border-dark">
                <td className="py-1 text-text-muted">{idx + 1}</td>
                <td className="py-1 font-medium">{row.team}</td>
                <td className="py-1 text-right tabular-nums">
                  {row.matchWins}-{row.matchLosses}
                </td>
                <td
                  className={`py-1 text-right tabular-nums ${
                    row.pointDiff > 0
                      ? 'text-emerald-300'
                      : row.pointDiff < 0
                        ? 'text-red-300'
                        : 'text-text-muted'
                  }`}
                >
                  {row.pointDiff > 0 ? '+' : ''}
                  {row.pointDiff}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {primary && (
        <p className="mt-2 text-[10px] text-text-muted">
          {title.includes('Player')
            ? 'Tiebreakers: wins, then point differential, then games won, then alphabetical.'
            : 'Tiebreakers: wins, then head-to-head within tied group, then point differential, then games won.'}
        </p>
      )}
    </div>
  );
}
