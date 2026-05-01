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

type RosterRow = {
  display_name: string;
  tournament_id: string;
};

export default async function HomePage() {
  const profile = await getProfile();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: liveData }, { data: myRoster }] = await Promise.all([
    supabase
      .from('matches')
      .select(
        'id,tournament_id,court_label,round_label,team_a_label,team_b_label,team_a_score,team_b_score,completed_at',
      )
      .order('created_at', { ascending: false })
      .limit(6),
    user
      ? supabase
          .from('tournament_players')
          .select('display_name,tournament_id')
          .eq('profile_id', user.id)
      : Promise.resolve({ data: [] }),
  ]);
  const liveMatches = (liveData ?? []) as LiveMatch[];

  // "My next match" lookup: find the oldest pending match across the user's
  // tournaments where their display name appears on either team.
  let myNextMatch: LiveMatch | null = null;
  if (user && (myRoster as RosterRow[] | undefined)?.length) {
    const roster = myRoster as RosterRow[];
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
    const { data: pending } = await supabase
      .from('matches')
      .select(
        'id,tournament_id,court_label,round_label,team_a_label,team_b_label,team_a_score,team_b_score,completed_at',
      )
      .in('tournament_id', tournamentIds)
      .is('completed_at', null)
      .order('created_at', { ascending: true })
      .limit(50);
    for (const match of (pending ?? []) as LiveMatch[]) {
      const names = namesByTournament.get(match.tournament_id);
      if (!names) continue;
      const aHas = match.team_a_label.split('&').some((p) => names.has(p.trim()));
      const bHas = match.team_b_label.split('&').some((p) => names.has(p.trim()));
      if (aHas || bHas) {
        myNextMatch = match;
        break;
      }
    }
  }

  return (
    <div className="space-y-6">
      <section className="card relative overflow-hidden p-6">
        <div className="absolute right-0 top-0 h-40 w-40 -translate-y-1/4 translate-x-1/4 rounded-full bg-volt/10 blur-3xl" />
        <p className="text-xs font-semibold uppercase tracking-wider text-volt">Live Tournament Platform</p>
        <h1 className="mt-2 font-display text-4xl font-bold tracking-tight sm:text-5xl">TourneyPal</h1>
        <p className="mt-3 max-w-2xl text-text-muted">
          Premium dark-mode tournament platform: divisions, best-of-N scoring, and standings with
          proper tiebreakers - built for actual pickleball events.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/tournaments" className="btn btn-primary">
            My tournaments
          </Link>
          <Link href="/scoreboard" className="btn btn-primary">
            Open scoreboard
          </Link>
          <Link href="/history" className="btn btn-ghost">
            Player history
          </Link>
          <Link href="/profile" className="btn btn-ghost">
            Player profile
          </Link>
          {(profile?.role === 'admin' || profile?.role === 'organizer') && (
            <Link href="/admin" className="btn btn-ghost">
              Admin
            </Link>
          )}
        </div>
      </section>

      {myNextMatch && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-xl font-bold">Up next for you</h2>
            <Link
              href={`/scoreboard/${myNextMatch.tournament_id}`}
              className="text-sm font-semibold text-volt hover:text-volt-hover"
            >
              Open scoreboard
            </Link>
          </div>
          <Link
            href={`/scoreboard/${myNextMatch.tournament_id}`}
            className="card relative block overflow-hidden p-5 transition hover:border-volt/40"
          >
            <p className="text-xs uppercase tracking-wider text-volt">
              {myNextMatch.court_label ?? 'Court'} - {myNextMatch.round_label ?? 'Round'}
            </p>
            <p className="mt-2 font-display text-2xl font-bold">
              {myNextMatch.team_a_label} <span className="text-text-muted">vs</span>{' '}
              {myNextMatch.team_b_label}
            </p>
            <p className="mt-1 text-xs text-text-muted">
              Tap to score this match or see your division&rsquo;s standings.
            </p>
          </Link>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold">Live courts</h2>
          <Link href="/scoreboard" className="text-sm font-semibold text-volt hover:text-volt-hover">
            View all
          </Link>
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
            {liveMatches.map((m) => {
              const status: 'live' | 'final' | 'upcoming' = m.completed_at
                ? 'final'
                : m.team_a_score !== null || m.team_b_score !== null
                  ? 'live'
                  : 'upcoming';
              return (
                <Link key={m.id} href={`/scoreboard/${m.tournament_id}`} className="block">
                  <MatchCard
                    court={m.court_label ?? 'Court'}
                    division={m.round_label ?? 'Round'}
                    teamA={m.team_a_label}
                    scoreA={m.team_a_score ?? 0}
                    teamB={m.team_b_label}
                    scoreB={m.team_b_score ?? 0}
                    status={status}
                  />
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {!profile && (
        <section className="card">
          <h3 className="font-display text-lg font-semibold">Get started</h3>
          <p className="mt-2 text-sm text-text-muted">
            Sign in with your email and password to create tournaments, manage rosters, and track
            your match history. New players can register in seconds.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/login" className="btn btn-primary">
              Sign in
            </Link>
            <Link href="/signup" className="btn btn-ghost">
              Create account
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
