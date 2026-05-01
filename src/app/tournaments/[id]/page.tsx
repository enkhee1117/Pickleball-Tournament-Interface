import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { addTournamentPlayer, generateRoundRobinMatches, updateTournamentWhatsApp } from '@/app/tournaments/actions';
import type { Tournament } from '@/lib/types';

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
};

type PlayerRow = {
  id: string;
  display_name: string;
  email: string | null;
  profile_id: string | null;
  created_at: string;
};

type MatchRow = {
  id: string;
  round_label: string | null;
  court_label: string | null;
  team_a_label: string;
  team_b_label: string;
  team_a_score: number | null;
  team_b_score: number | null;
  created_at: string;
};

export default async function TournamentDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();

  const [{ data: tournament }, { data: players }, { data: matches }, { data: userData }] = await Promise.all([
    supabase.from('tournaments').select('*').eq('id', id).single(),
    supabase.from('tournament_players').select('id,display_name,email,profile_id,created_at').eq('tournament_id', id).order('created_at', { ascending: true }),
    supabase.from('matches').select('id,round_label,court_label,team_a_label,team_b_label,team_a_score,team_b_score,created_at').eq('tournament_id', id).order('created_at', { ascending: false }).limit(100),
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

  const t = tournament as Tournament;
  const p = (players ?? []) as PlayerRow[];
  const m = (matches ?? []) as MatchRow[];

  return (
    <div className="space-y-6">
      <section className="card p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-text-muted">Tournament</p>
            <h1 className="font-display text-3xl font-bold">{t.name}</h1>
            <p className="mt-1 text-sm text-text-muted">
              format: {t.format} - status: {t.status}
            </p>
          </div>
          <Link href="/tournaments" className="btn btn-ghost">Back</Link>
        </div>
      </section>

      {sp.error && <div className="rounded border border-error/40 bg-error/10 px-3 py-2 text-sm text-red-300">{sp.error}</div>}
      {sp.ok && <div className="rounded border border-success/40 bg-success/10 px-3 py-2 text-sm text-emerald-300">{sp.ok}</div>}

      <section className="card">
        <h2 className="font-display text-xl font-semibold">WhatsApp Integration</h2>
        <p className="mt-1 text-sm text-text-muted">Use a WhatsApp group link instead of in-app chat.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {t.whatsapp_group_url ? (
            <a className="btn btn-primary" href={t.whatsapp_group_url} target="_blank" rel="noreferrer">Open WhatsApp Group</a>
          ) : (
            <span className="text-sm text-text-muted">No group link set yet.</span>
          )}
        </div>
        {canManage && (
          <form action={updateTournamentWhatsApp} className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
            <input type="hidden" name="tournament_id" value={t.id} />
            <input
              className="input"
              name="whatsapp_group_url"
              defaultValue={t.whatsapp_group_url ?? ''}
              placeholder="https://chat.whatsapp.com/..."
            />
            <button className="btn btn-ghost" type="submit">Save Link</button>
          </form>
        )}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold">Players</h2>
            <span className="text-xs text-text-muted">{p.length} total</span>
          </div>
          {canManage && (
            <form action={addTournamentPlayer} className="mb-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <input type="hidden" name="tournament_id" value={t.id} />
              <input className="input" name="display_name" placeholder="Player name" required />
              <input className="input" name="email" type="email" placeholder="Email (optional, links history)" />
              <button className="btn btn-primary" type="submit">Add</button>
            </form>
          )}
          {p.length === 0 ? (
            <p className="text-sm text-text-muted">No players yet.</p>
          ) : (
            <div className="space-y-2">
              {p.map((player) => (
                <div key={player.id} className="flex items-center justify-between rounded-md border border-border-dark bg-dark-bg px-3 py-2">
                  <div>
                    <p className="font-medium">{player.display_name}</p>
                    {player.email && (
                      <p className="text-xs text-text-muted">{player.email}</p>
                    )}
                  </div>
                  {player.profile_id ? (
                    <span className="rounded-full border border-success/40 bg-success/10 px-2 py-0.5 text-xs text-emerald-300">
                      linked
                    </span>
                  ) : player.email ? (
                    <span className="rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-xs text-amber-300">
                      pending signup
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold">Matches</h2>
            {canManage && (
              <form action={generateRoundRobinMatches}>
                <input type="hidden" name="tournament_id" value={t.id} />
                <button className="btn btn-ghost" type="submit">Generate Round Robin</button>
              </form>
            )}
          </div>
          {m.length === 0 ? (
            <p className="text-sm text-text-muted">No matches generated yet.</p>
          ) : (
            <div className="space-y-2">
              {m.map((match) => (
                <div key={match.id} className="rounded-md border border-border-dark bg-dark-bg px-3 py-2">
                  <p className="font-medium">{match.team_a_label} vs {match.team_b_label}</p>
                  <p className="text-xs text-text-muted">
                    {match.round_label ?? 'Round'} - {match.court_label ?? 'Court'} - score: {match.team_a_score ?? '-'}:{match.team_b_score ?? '-'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
