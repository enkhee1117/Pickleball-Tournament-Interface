import Link from 'next/link';
import { getProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { MatchCard } from '@/components/ui/MatchCard';

type LiveMatch = {
  id: string;
  tournament_id: string;
  court_label: string | null;
  round_label: string | null;
  team_a_label: string;
  team_b_label: string;
  team_a_score: number | null;
  team_b_score: number | null;
  completed_at: string | null;
};

export default async function HomePage() {
  const profile = await getProfile();
  const supabase = await createClient();
  const { data: liveData } = await supabase
    .from('matches')
    .select('id,tournament_id,court_label,round_label,team_a_label,team_b_label,team_a_score,team_b_score,completed_at')
    .order('created_at', { ascending: false })
    .limit(6);
  const liveMatches = (liveData ?? []) as LiveMatch[];

  return (
    <div className="space-y-6">
      <section className="card relative overflow-hidden p-6">
        <div className="absolute right-0 top-0 h-40 w-40 -translate-y-1/4 translate-x-1/4 rounded-full bg-volt/10 blur-3xl" />
        <p className="text-xs font-semibold uppercase tracking-wider text-volt">Live Tournament Platform</p>
        <h1 className="mt-2 font-display text-4xl font-bold tracking-tight sm:text-5xl">TourneyPal</h1>
        <p className="mt-3 max-w-2xl text-text-muted">
          Premium, dark-mode-first tournament interface for scoreboard updates, realtime chat,
          player profiles, and staff operations.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/tournaments" className="btn btn-primary">My tournaments</Link>
          <Link href="/scoreboard" className="btn btn-primary">Open scoreboard</Link>
          <Link href="/history" className="btn btn-ghost">Player history</Link>
          <Link href="/profile" className="btn btn-ghost">Player profile</Link>
          {(profile?.role === 'admin' || profile?.role === 'organizer') && (
            <Link href="/admin" className="btn btn-ghost">
              Admin
            </Link>
          )}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold">Live Courts</h2>
          <Link href="/scoreboard" className="text-sm font-semibold text-volt hover:text-volt-hover">View all</Link>
        </div>
        {liveMatches.length === 0 ? (
          <div className="card p-6 text-center text-sm text-text-muted">
            No matches yet.{' '}
            <Link href="/tournaments" className="font-semibold text-volt hover:text-volt-hover">
              Create a tournament
            </Link>{' '}
            to get started.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {liveMatches.map((m) => (
              <Link key={m.id} href={`/tournaments/${m.tournament_id}`} className="block">
                <MatchCard
                  court={m.court_label ?? 'Court'}
                  division={m.round_label ?? 'Round'}
                  teamA={m.team_a_label}
                  scoreA={m.team_a_score ?? 0}
                  teamB={m.team_b_label}
                  scoreB={m.team_b_score ?? 0}
                  status={m.completed_at ? 'final' : 'live'}
                />
              </Link>
            ))}
          </div>
        )}
      </section>

      {!profile && (
        <section className="card">
          <h3 className="font-display text-lg font-semibold">Get started</h3>
          <p className="mt-2 text-sm text-text-muted">
            Sign in with your email and password to create tournaments, manage rosters, and
            track your match history. New players can register in seconds.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/login" className="btn btn-primary">Sign in</Link>
            <Link href="/signup" className="btn btn-ghost">Create account</Link>
          </div>
        </section>
      )}
    </div>
  );
}
