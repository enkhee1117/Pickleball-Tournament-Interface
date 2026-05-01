import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { StatusBadge } from '@/components/ui/StatusBadge';

type TournamentSummary = {
  id: string;
  name: string;
  format: string;
  status: 'draft' | 'active' | 'completed' | 'archived';
  created_at: string;
};

type MembershipRow = {
  role: string;
  tournaments: TournamentSummary | null;
};

type PlayerRosterRow = {
  id: string;
  display_name: string;
  tournament_id: string;
  tournaments: { name: string } | null;
};

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
};

function statusToBadge(status: TournamentSummary['status']) {
  if (status === 'active') return 'live' as const;
  if (status === 'completed' || status === 'archived') return 'final' as const;
  return 'upcoming' as const;
}

function dateLabel(value: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
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
        <Link href="/login?next=/history" className="btn btn-primary mt-4">Sign in</Link>
      </div>
    );
  }

  const [{ data: memberships }, { data: rosterRows }] = await Promise.all([
    supabase
      .from('tournament_members')
      .select('role,tournaments(id,name,format,status,created_at)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('tournament_players')
      .select('id,display_name,tournament_id,tournaments(name)')
      .eq('profile_id', user.id),
  ]);

  const tournaments = ((memberships as MembershipRow[] | null) ?? [])
    .map((m) => ({ role: m.role, t: m.tournaments }))
    .filter((m): m is { role: string; t: TournamentSummary } => m.t !== null);

  const roster = (rosterRows as PlayerRosterRow[] | null) ?? [];
  const myLabels = new Set(
    roster.map((r) => r.display_name.trim().toLowerCase()).filter(Boolean),
  );
  const tournamentIds = Array.from(
    new Set([
      ...tournaments.map((m) => m.t.id),
      ...roster.map((r) => r.tournament_id),
    ]),
  );

  let matches: MatchRow[] = [];
  if (tournamentIds.length > 0) {
    const { data } = await supabase
      .from('matches')
      .select(
        'id,tournament_id,team_a_label,team_b_label,team_a_score,team_b_score,winner_side,completed_at,created_at',
      )
      .in('tournament_id', tournamentIds)
      .order('created_at', { ascending: false })
      .limit(100);
    matches = (data as MatchRow[] | null) ?? [];
  }

  const myMatches = matches.filter((m) => {
    if (myLabels.size === 0) return false;
    const a = m.team_a_label.trim().toLowerCase();
    const b = m.team_b_label.trim().toLowerCase();
    return myLabels.has(a) || myLabels.has(b);
  });

  const tournamentNameById = new Map<string, string>();
  for (const m of tournaments) tournamentNameById.set(m.t.id, m.t.name);
  for (const r of roster) {
    if (r.tournaments?.name) tournamentNameById.set(r.tournament_id, r.tournaments.name);
  }

  const wins = myMatches.filter((m) => {
    if (m.winner_side === null) return false;
    const winnerLabel =
      m.winner_side === 'a' ? m.team_a_label : m.team_b_label;
    return myLabels.has(winnerLabel.trim().toLowerCase());
  }).length;
  const losses = myMatches.filter((m) => {
    if (m.winner_side === null) return false;
    const loserLabel =
      m.winner_side === 'a' ? m.team_b_label : m.team_a_label;
    return myLabels.has(loserLabel.trim().toLowerCase());
  }).length;

  return (
    <div className="space-y-6">
      <section className="card relative overflow-hidden p-6">
        <div className="absolute right-0 top-0 h-40 w-40 -translate-y-1/4 translate-x-1/4 rounded-full bg-volt/10 blur-3xl" />
        <p className="text-xs font-semibold uppercase tracking-wider text-volt">Your TourneyPal record</p>
        <h1 className="mt-2 font-display text-3xl font-bold">Player history</h1>
        <p className="mt-2 text-sm text-text-muted">
          Tournaments you&rsquo;ve joined and matches you&rsquo;ve played.
        </p>
        <div className="mt-4 grid grid-cols-3 gap-3 sm:max-w-md">
          <div className="rounded-lg border border-border-dark bg-dark-bg px-4 py-3">
            <p className="text-xs uppercase tracking-wider text-text-muted">Tournaments</p>
            <p className="mt-1 font-display text-2xl font-bold tabular-nums">{tournaments.length}</p>
          </div>
          <div className="rounded-lg border border-border-dark bg-dark-bg px-4 py-3">
            <p className="text-xs uppercase tracking-wider text-text-muted">Wins</p>
            <p className="mt-1 font-display text-2xl font-bold tabular-nums text-emerald-300">{wins}</p>
          </div>
          <div className="rounded-lg border border-border-dark bg-dark-bg px-4 py-3">
            <p className="text-xs uppercase tracking-wider text-text-muted">Losses</p>
            <p className="mt-1 font-display text-2xl font-bold tabular-nums text-red-300">{losses}</p>
          </div>
        </div>
      </section>

      <section className="card">
        <h2 className="font-display text-xl font-semibold">Tournaments</h2>
        {tournaments.length === 0 ? (
          <p className="mt-2 text-sm text-text-muted">
            No tournaments yet. Create one or ask an organizer to add you with your email.
          </p>
        ) : (
          <div className="mt-3 grid gap-3">
            {tournaments.map((m) => (
              <div
                key={`${m.t.id}-${m.role}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-border-dark bg-dark-bg px-4 py-3"
              >
                <div>
                  <Link
                    href={`/tournaments/${m.t.id}`}
                    className="font-display text-lg font-semibold hover:text-volt"
                  >
                    {m.t.name}
                  </Link>
                  <p className="text-xs text-text-muted">
                    {m.t.format} · role: {m.role} · joined {dateLabel(m.t.created_at)}
                  </p>
                </div>
                <StatusBadge status={statusToBadge(m.t.status)} />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <h2 className="font-display text-xl font-semibold">Match history</h2>
        <p className="mt-1 text-xs text-text-muted">
          Matches across the tournaments you participate in. Add your email to a roster spot to
          link more results to your account.
        </p>
        {matches.length === 0 ? (
          <p className="mt-3 text-sm text-text-muted">No matches recorded yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-text-muted">
                <tr>
                  <th className="py-2">Date</th>
                  <th>Tournament</th>
                  <th>Match</th>
                  <th>Score</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {matches.map((m) => {
                  const a = m.team_a_label.trim().toLowerCase();
                  const b = m.team_b_label.trim().toLowerCase();
                  const involvesMe = myLabels.has(a) || myLabels.has(b);
                  let result = '—';
                  if (involvesMe && m.winner_side) {
                    const myLabel = myLabels.has(a) ? a : myLabels.has(b) ? b : null;
                    const winnerLabel =
                      m.winner_side === 'a' ? a : b;
                    result = myLabel === winnerLabel ? 'win' : 'loss';
                  }
                  return (
                    <tr key={m.id} className="border-t border-border-dark">
                      <td className="py-2 text-text-muted">{dateLabel(m.completed_at ?? m.created_at)}</td>
                      <td>{tournamentNameById.get(m.tournament_id) ?? '—'}</td>
                      <td>
                        {m.team_a_label} <span className="text-text-muted">vs</span> {m.team_b_label}
                      </td>
                      <td className="tabular-nums">
                        {m.team_a_score ?? '–'} – {m.team_b_score ?? '–'}
                      </td>
                      <td>
                        {result === 'win' ? (
                          <span className="rounded-full border border-success/40 bg-success/10 px-2 py-0.5 text-xs text-emerald-300">win</span>
                        ) : result === 'loss' ? (
                          <span className="rounded-full border border-error/40 bg-error/10 px-2 py-0.5 text-xs text-red-300">loss</span>
                        ) : (
                          <span className="text-text-muted">{result}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
