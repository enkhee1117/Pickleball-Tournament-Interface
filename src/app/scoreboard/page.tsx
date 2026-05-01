import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

type LiveMatch = {
  id: string;
  tournament_id: string;
  round_label: string | null;
  court_label: string | null;
  team_a_label: string;
  team_b_label: string;
  team_a_score: number | null;
  team_b_score: number | null;
};

export default async function ScoreboardPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from('matches')
    .select('id,tournament_id,round_label,court_label,team_a_label,team_b_label,team_a_score,team_b_score')
    .order('created_at', { ascending: false })
    .limit(20);

  const matches = (data ?? []) as LiveMatch[];

  return (
    <div className="space-y-6">
      <section className="card p-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-volt">Scoreboard</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Live matches</h1>
        <p className="mt-2 text-sm text-text-muted">
          Scores update as organizers report them inside each tournament.
        </p>
      </section>

      {matches.length === 0 ? (
        <section className="card p-6 text-center">
          <p className="text-sm text-text-muted">No matches yet.</p>
          <Link href="/tournaments" className="btn btn-primary mt-3 inline-block">
            Go to tournaments
          </Link>
        </section>
      ) : (
        <section className="grid gap-3 sm:grid-cols-2">
          {matches.map((m) => (
            <Link
              key={m.id}
              href={`/tournaments/${m.tournament_id}`}
              className="card block p-4 transition hover:border-volt/40"
            >
              <p className="text-xs uppercase tracking-wider text-text-muted">
                {(m.court_label ?? 'Court')} - {(m.round_label ?? 'Round')}
              </p>
              <div className="mt-2 flex items-baseline justify-between gap-3">
                <span className="font-medium">{m.team_a_label}</span>
                <span className="font-display text-xl font-bold">{m.team_a_score ?? '-'}</span>
              </div>
              <div className="mt-1 flex items-baseline justify-between gap-3">
                <span className="font-medium">{m.team_b_label}</span>
                <span className="font-display text-xl font-bold">{m.team_b_score ?? '-'}</span>
              </div>
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}
