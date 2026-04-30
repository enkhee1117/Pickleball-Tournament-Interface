import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createTournament } from './actions';
import type { Tournament } from '@/lib/types';

type TournamentMemberRow = {
  role: string;
  tournaments: Tournament | null;
};

export default async function TournamentsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let rows: TournamentMemberRow[] = [];
  if (user) {
    const { data } = await supabase
      .from('tournament_members')
      .select('role,tournaments(*)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    rows = (data as TournamentMemberRow[] | null) ?? [];
  }

  return (
    <div className="space-y-6">
      <section className="card p-6">
        <h1 className="font-display text-3xl font-bold">My Tournaments</h1>
        <p className="mt-2 text-sm text-text-muted">
          Create and manage your own tournaments. Players and matches are scoped per tournament.
        </p>
      </section>

      {sp.error && (
        <div className="rounded border border-error/40 bg-error/10 px-3 py-2 text-sm text-red-300">
          {sp.error}
        </div>
      )}
      {sp.ok && (
        <div className="rounded border border-success/40 bg-success/10 px-3 py-2 text-sm text-emerald-300">
          {sp.ok}
        </div>
      )}

      <section className="card">
        <h2 className="font-display text-xl font-semibold">Create Tournament</h2>
        {!user ? (
          <p className="mt-2 text-sm text-text-muted">
            Sign in to create tournaments. Public mode browsing is still enabled for other features.
          </p>
        ) : (
          <form action={createTournament} className="mt-4 grid gap-4 md:grid-cols-3">
            <div className="md:col-span-2">
              <label className="label">Tournament Name</label>
              <input className="input" name="name" placeholder="e.g. Spring Open 2026" required />
            </div>
            <div>
              <label className="label">Format</label>
              <select className="input" name="format" defaultValue="round_robin">
                <option value="round_robin">round_robin</option>
                <option value="fixed_partners">fixed_partners</option>
                <option value="bracket">bracket</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="label">WhatsApp Group URL (optional)</label>
              <input
                className="input"
                name="whatsapp_group_url"
                placeholder="https://chat.whatsapp.com/..."
              />
            </div>
            <div className="flex items-end">
              <button className="btn btn-primary w-full" type="submit">Create</button>
            </div>
          </form>
        )}
      </section>

      <section className="card">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold">Your Tournament List</h2>
          <Link href="/history" className="text-sm font-semibold text-volt hover:text-volt-hover">
            Open History
          </Link>
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-text-muted">No tournaments yet.</p>
        ) : (
          <div className="grid gap-3">
            {rows.map((r) => {
              const t = r.tournaments;
              if (!t) return null;
              return (
                <div key={`${t.id}-${r.role}`} className="rounded-lg border border-border-dark bg-dark-bg px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-display text-lg font-semibold">
                        <Link href={`/tournaments/${t.id}`} className="hover:text-volt">
                          {t.name}
                        </Link>
                      </h3>
                      <p className="text-xs text-text-muted">
                        format: {t.format} - status: {t.status} - role: {r.role}
                      </p>
                    </div>
                    {t.whatsapp_group_url ? (
                      <a
                        href={t.whatsapp_group_url}
                        className="btn btn-ghost"
                        target="_blank"
                        rel="noreferrer"
                      >
                        WhatsApp Group
                      </a>
                    ) : (
                      <span className="text-xs text-text-muted">No WhatsApp link</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
