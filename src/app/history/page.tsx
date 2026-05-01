import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

type RosterRow = {
  id: string;
  display_name: string;
  tournament_id: string;
  tournaments: { id: string; name: string; status: string }[] | null;
};

const firstTournament = (r: RosterRow) =>
  Array.isArray(r.tournaments) ? r.tournaments[0] : r.tournaments;

type MatchRow = {
  id: string;
  tournament_id: string;
  team_a_label: string;
  team_b_label: string;
  team_a_score: number | null;
  team_b_score: number | null;
  winner_side: 'a' | 'b' | null;
  completed_at: string | null;
  created_at: string;
  match_games: { game_no: number; team_a_score: number; team_b_score: number }[] | null;
};

function dateLabel(value: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default async function HistoryPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="card mx-auto mt-12 max-w-xl p-6">
        <h1 className="font-display text-2xl font-bold">Player history</h1>
        <p className="mt-2 text-sm text-text-muted">
          Sign in to view your tournament participation and match history.
        </p>
        <Link href="/login?next=/history" className="btn btn-primary mt-4 inline-block">
          Sign in
        </Link>
      </div>
    );
  }

  // Find every tournament_player row this user is linked to via profile_id.
  // That linkage is set automatically by the link_tournament_player_to_profile
  // trigger when an organizer adds a player with the user's email.
  const { data: rosterData } = await supabase
    .from('tournament_players')
    .select('id,display_name,tournament_id,tournaments(id,name,status)')
    .eq('profile_id', user.id);
  const roster = ((rosterData ?? []) as unknown) as RosterRow[];

  const tournamentIds = Array.from(new Set(roster.map((r) => r.tournament_id)));
  const namesByTournament = new Map<string, Set<string>>();
  for (const r of roster) {
    let s = namesByTournament.get(r.tournament_id);
    if (!s) {
      s = new Set();
      namesByTournament.set(r.tournament_id, s);
    }
    s.add(r.display_name.trim());
  }

  let matches: MatchRow[] = [];
  if (tournamentIds.length > 0) {
    const { data } = await supabase
      .from('matches')
      .select(
        'id,tournament_id,team_a_label,team_b_label,team_a_score,team_b_score,winner_side,completed_at,created_at,match_games(game_no,team_a_score,team_b_score)',
      )
      .in('tournament_id', tournamentIds)
      .not('completed_at', 'is', null)
      .order('completed_at', { ascending: false })
      .limit(200);
    matches = (data ?? []) as MatchRow[];
  }

  type MyMatch = MatchRow & { result: 'win' | 'loss' };
  const involvesMe = (match: MatchRow) => {
    const myNames = namesByTournament.get(match.tournament_id);
    if (!myNames) return null;
    // Doubles labels look like "Alice & Bob". Singles labels are just "Alice".
    const teamAHas = match.team_a_label.split('&').some((p) => myNames.has(p.trim()));
    const teamBHas = match.team_b_label.split('&').some((p) => myNames.has(p.trim()));
    if (teamAHas) return 'a' as const;
    if (teamBHas) return 'b' as const;
    return null;
  };

  const myMatches: MyMatch[] = [];
  for (const match of matches) {
    const side = involvesMe(match);
    if (!side || !match.winner_side) continue;
    myMatches.push({ ...match, result: side === match.winner_side ? 'win' : 'loss' });
  }

  const wins = myMatches.filter((x) => x.result === 'win').length;
  const losses = myMatches.length - wins;
  const winPct = myMatches.length === 0 ? 0 : wins / myMatches.length;

  const tournamentSummaries = Array.from(namesByTournament.entries()).map(([tid, names]) => {
    const t = firstTournament(roster.find((r) => r.tournament_id === tid)!);
    const my = myMatches.filter((x) => x.tournament_id === tid);
    return {
      id: tid,
      name: t?.name ?? 'Tournament',
      status: t?.status ?? 'unknown',
      labels: Array.from(names),
      wins: my.filter((x) => x.result === 'win').length,
      losses: my.filter((x) => x.result === 'loss').length,
    };
  });

  return (
    <div className="space-y-6">
      <section className="card relative overflow-hidden p-6">
        <div className="absolute right-0 top-0 h-40 w-40 -translate-y-1/4 translate-x-1/4 rounded-full bg-volt/10 blur-3xl" />
        <p className="text-xs font-semibold uppercase tracking-wider text-volt">Your record</p>
        <h1 className="mt-2 font-display text-3xl font-bold">Player history</h1>
        <p className="mt-2 text-sm text-text-muted">
          Match results from every tournament where you&rsquo;re listed on the roster (linked by
          your sign-in email).
        </p>
        <div className="mt-4 grid grid-cols-4 gap-3 sm:max-w-2xl">
          <Stat label="Tournaments" value={tournamentSummaries.length} />
          <Stat label="Matches" value={myMatches.length} />
          <Stat label="Wins" value={wins} tone="positive" />
          <Stat label="Win %" value={`${(winPct * 100).toFixed(0)}%`} tone={winPct >= 0.5 ? 'positive' : 'muted'} />
        </div>
      </section>

      <section className="card">
        <h2 className="font-display text-xl font-semibold">By tournament</h2>
        {tournamentSummaries.length === 0 ? (
          <p className="mt-2 text-sm text-text-muted">
            No tournaments yet. Ask an organizer to add you with your sign-in email.
          </p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {tournamentSummaries.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between rounded-md border border-border-dark bg-dark-bg px-3 py-2"
              >
                <div>
                  <Link
                    href={`/scoreboard/${s.id}`}
                    className="font-display font-semibold hover:text-volt"
                  >
                    {s.name}
                  </Link>
                  <p className="text-xs text-text-muted">
                    {s.status} - listed as {s.labels.join(', ')}
                  </p>
                </div>
                <p className="font-display text-sm tabular-nums">
                  <span className="text-emerald-300">{s.wins}</span>
                  <span className="text-text-muted">/</span>
                  <span className="text-red-300">{s.losses}</span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2 className="font-display text-xl font-semibold">Recent matches</h2>
        {myMatches.length === 0 ? (
          <p className="mt-2 text-sm text-text-muted">
            No completed matches yet. Once organizers report scores, your results show up here.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-text-muted">
                <tr>
                  <th className="py-2">Date</th>
                  <th>Match</th>
                  <th>Score</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {myMatches.slice(0, 50).map((match) => (
                  <tr key={match.id} className="border-t border-border-dark">
                    <td className="py-2 text-text-muted">{dateLabel(match.completed_at ?? match.created_at)}</td>
                    <td>
                      {match.team_a_label} <span className="text-text-muted">vs</span> {match.team_b_label}
                    </td>
                    <td className="tabular-nums">
                      {(match.match_games ?? [])
                        .sort((a, b) => a.game_no - b.game_no)
                        .map((g) => `${g.team_a_score}-${g.team_b_score}`)
                        .join(', ') || `${match.team_a_score ?? '–'}–${match.team_b_score ?? '–'}`}
                    </td>
                    <td>
                      {match.result === 'win' ? (
                        <span className="rounded-full border border-success/40 bg-success/10 px-2 py-0.5 text-xs text-emerald-300">
                          win
                        </span>
                      ) : (
                        <span className="rounded-full border border-error/40 bg-error/10 px-2 py-0.5 text-xs text-red-300">
                          loss
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: 'positive' | 'muted';
}) {
  return (
    <div className="rounded-lg border border-border-dark bg-dark-bg px-3 py-2">
      <p className="text-xs uppercase tracking-wider text-text-muted">{label}</p>
      <p
        className={`mt-1 font-display text-2xl font-bold tabular-nums ${
          tone === 'positive' ? 'text-emerald-300' : tone === 'muted' ? 'text-text-muted' : ''
        }`}
      >
        {value}
      </p>
    </div>
  );
}
