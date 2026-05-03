import Link from 'next/link';
import { getProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { AvatarUpload } from '@/components/AvatarUpload';
import { ProfileForm } from './_components/ProfileForm';
import type { TournamentStatus } from '@/lib/types';

type ManagedTournament = {
  tournament_id: string;
  role: string;
  tournaments: { id: string; name: string; status: TournamentStatus } | null;
};

type PlayerTournament = {
  display_name: string;
  tournament_id: string;
  tournaments: { id: string; name: string; status: TournamentStatus } | null;
};

const STATUS_BADGE: Record<TournamentStatus, string> = {
  draft: 'text-text-muted',
  active: 'text-emerald-300',
  completed: 'text-volt',
  archived: 'text-text-muted',
};

export default async function ProfilePage() {
  const profile = await getProfile();

  if (!profile) {
    return (
      <div className="card mx-auto mt-12 max-w-xl p-6">
        <h1 className="font-display text-2xl font-bold">Profile</h1>
        <p className="mt-2 text-sm text-text-muted">
          <Link href="/login?next=/profile" className="font-semibold text-volt hover:text-volt-hover">
            Sign in
          </Link>{' '}
          to view and edit your TourneyPal profile.
        </p>
      </div>
    );
  }

  const supabase = await createClient();

  const [{ data: managedRaw }, { data: playerRaw }] = await Promise.all([
    supabase
      .from('tournament_members')
      .select('tournament_id,role,tournaments(id,name,status)')
      .eq('user_id', profile.id)
      .in('role', ['owner', 'organizer'])
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('tournament_players')
      .select('display_name,tournament_id,tournaments(id,name,status)')
      .eq('profile_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  const managed = (managedRaw as ManagedTournament[] | null) ?? [];
  const playing = (playerRaw as PlayerTournament[] | null) ?? [];

  // Deduplicate player tournaments that are also managed (avoid showing twice).
  const managedIds = new Set(managed.map((m) => m.tournament_id));
  const playingOnly = playing.filter((p) => !managedIds.has(p.tournament_id));

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-[260px_1fr]">
        <div className="card">
          <AvatarUpload userId={profile.id} initialUrl={profile.avatar_url} />
          <p className="mt-3 text-xs text-text-muted">
            Role: <span className="text-slate-200">{profile.role}</span>
          </p>
        </div>
        <ProfileForm profile={profile} />
      </div>

      {managed.length > 0 && (
        <section className="card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold">Tournaments you manage</h2>
            <Link href="/tournaments" className="text-sm font-semibold text-volt hover:text-volt-hover">
              All tournaments
            </Link>
          </div>
          <div className="space-y-2">
            {managed.map((m) => {
              const t = m.tournaments;
              if (!t) return null;
              return (
                <div
                  key={m.tournament_id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border-dark bg-dark-bg px-4 py-3"
                >
                  <div>
                    <p className="font-display font-semibold">{t.name}</p>
                    <p className="text-xs text-text-muted">
                      {m.role} &middot;{' '}
                      <span className={STATUS_BADGE[t.status]}>{t.status}</span>
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Link
                      href={`/scoreboard/${t.id}`}
                      className="btn btn-ghost py-1 px-3 text-xs"
                    >
                      Scoreboard
                    </Link>
                    <Link
                      href={`/tournaments/${t.id}`}
                      className="btn btn-primary py-1 px-3 text-xs"
                    >
                      Manage
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {playingOnly.length > 0 && (
        <section className="card">
          <h2 className="mb-3 font-display text-xl font-semibold">Tournaments you&apos;re in</h2>
          <div className="space-y-2">
            {playingOnly.map((p) => {
              const t = p.tournaments;
              if (!t) return null;
              return (
                <Link
                  key={p.tournament_id}
                  href={`/scoreboard/${t.id}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border-dark bg-dark-bg px-4 py-3 transition hover:border-volt/40"
                >
                  <div>
                    <p className="font-display font-semibold">{t.name}</p>
                    <p className="text-xs text-text-muted">
                      playing as <span className="text-slate-200">{p.display_name}</span> &middot;{' '}
                      <span className={STATUS_BADGE[t.status]}>{t.status}</span>
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-volt">View scoreboard →</span>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
