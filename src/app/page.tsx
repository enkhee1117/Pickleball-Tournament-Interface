import Link from 'next/link';
import { getProfile } from '@/lib/auth';
import { MatchCard } from '@/components/ui/MatchCard';

export default async function HomePage() {
  const profile = await getProfile();

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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <MatchCard
            court="Tourney"
            division="Create and manage"
            teamA="Your Tournaments"
            scoreA={1}
            teamB="Draft setup"
            scoreB={0}
            status="upcoming"
          />
          <MatchCard
            court="Center Court"
            division="Men's Doubles Finals"
            teamA="Johns / Johns"
            scoreA={10}
            teamB="Newman / Wright"
            scoreB={8}
            status="live"
          />
          <MatchCard
            court="Court 2"
            division="Women's Quarterfinal"
            teamA="Waters / Parenteau"
            scoreA={11}
            teamB="Bright / Dizon"
            scoreB={4}
            status="live"
          />
          <MatchCard
            court="Court 3"
            division="Mixed Quarterfinal"
            teamA="Johnson / Johnson"
            scoreA={11}
            teamB="Tardio / David"
            scoreB={9}
            status="final"
          />
        </div>
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
