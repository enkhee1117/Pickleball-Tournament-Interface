import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ScoreMatchForm, type GameInput } from '@/app/tournaments/_components/ScoreMatchForm';
import { computeStandings, type StandingsMatch } from '@/lib/scoring';

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
    divisionId ? dvs.find((d) => d.id === divisionId)?.name ?? 'Division' : 'Open';

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
            <Link href="/scoreboard" className="btn btn-ghost">All scoreboards</Link>
            <Link href={`/tournaments/${id}`} className="btn btn-ghost">Manage</Link>
          </div>
        </div>
      </section>

      {groupKeys.length === 0 && (
        <section className="card p-6 text-center">
          <p className="text-sm text-text-muted">
            No matches yet.{' '}
            {canManage && (
              <Link href={`/tournaments/${id}`} className="font-semibold text-volt hover:text-volt-hover">
                Generate some
              </Link>
            )}
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
          // If for whatever reason we have no per-game rows but the match is
          // marked complete, fall back to the aggregate winner the DB recorded.
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
        const standings = computeStandings(standingsInput);

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
                        <p className="text-xs uppercase tracking-wider text-text-muted">
                          {match.round_label ?? 'Round'} - {match.court_label ?? 'Court'}
                        </p>
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
              <div className="card">
                <h3 className="mb-3 font-display text-lg font-semibold">Standings</h3>
                {standings.length === 0 ? (
                  <p className="text-sm text-text-muted">Standings appear once matches finish.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs uppercase tracking-wider text-text-muted">
                      <tr>
                        <th className="py-1">#</th>
                        <th>Team</th>
                        <th className="text-right">W-L</th>
                        <th className="text-right">PD</th>
                      </tr>
                    </thead>
                    <tbody>
                      {standings.map((row, idx) => (
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
                <p className="mt-2 text-[10px] text-text-muted">
                  Tiebreakers: head-to-head wins (within tied group), then point differential, then
                  games won, then alphabetical.
                </p>
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
