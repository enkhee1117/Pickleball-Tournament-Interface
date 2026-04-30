import { createClient } from '@/lib/supabase/server';

export default async function HistoryPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="card max-w-xl">
        <h1 className="font-display text-2xl font-bold">History</h1>
        <p className="mt-2 text-text-muted">
          Sign in to view your tournament and match history.
        </p>
      </div>
    );
  }

  const [{ data: tournaments }, { data: matches }] = await Promise.all([
    supabase
      .from('tournament_players')
      .select('id,tournament_id,display_name,created_at')
      .eq('profile_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('matches')
      .select('id,tournament_id,team_a_label,team_b_label,team_a_score,team_b_score,completed_at,created_at')
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  return (
    <div className="space-y-6">
      <section className="card p-6">
        <h1 className="font-display text-3xl font-bold">Player History</h1>
        <p className="mt-2 text-sm text-text-muted">
          Your tournament participation and recent matches across TourneyPal.
        </p>
      </section>

      <section className="card">
        <h2 className="font-display text-xl font-semibold">Tournament Participation</h2>
        {tournaments && tournaments.length > 0 ? (
          <div className="mt-3 space-y-2">
            {tournaments.map((t) => (
              <div key={t.id} className="rounded-md border border-border-dark bg-dark-bg px-3 py-2 text-sm">
                <p className="font-semibold text-slate-100">{t.display_name}</p>
                <p className="text-xs text-text-muted">tournament: {t.tournament_id}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-text-muted">No tournament participation found yet.</p>
        )}
      </section>

      <section className="card">
        <h2 className="font-display text-xl font-semibold">Recent Matches</h2>
        {matches && matches.length > 0 ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-text-muted">
                <tr>
                  <th className="py-2">Match</th>
                  <th>Tournament</th>
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
                {matches.map((m) => (
                  <tr key={m.id} className="border-t border-border-dark">
                    <td className="py-2">{m.team_a_label} vs {m.team_b_label}</td>
                    <td className="text-text-muted">{m.tournament_id}</td>
                    <td className="tabular-nums">{m.team_a_score ?? '-'} - {m.team_b_score ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-2 text-sm text-text-muted">No match history yet.</p>
        )}
      </section>
    </div>
  );
}
