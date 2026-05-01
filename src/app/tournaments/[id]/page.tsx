import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AddPlayerForm } from '@/app/tournaments/_components/AddPlayerForm';
import {
  DivisionsPanel,
  type DivisionRow,
} from '@/app/tournaments/_components/DivisionsPanel';
import { GenerateMatchesForm } from '@/app/tournaments/_components/GenerateMatchesForm';
import { PlayerRow } from '@/app/tournaments/_components/PlayerRow';
import { ScoreMatchForm, type GameInput } from '@/app/tournaments/_components/ScoreMatchForm';
import { UpdateTournamentForm } from '@/app/tournaments/_components/UpdateTournamentForm';
import type { Tournament } from '@/lib/types';

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string }>;
};

type PlayerRowData = {
  id: string;
  display_name: string;
  email: string | null;
  profile_id: string | null;
  division_id: string | null;
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
  winner_side: 'a' | 'b' | null;
  completed_at: string | null;
  division_id: string | null;
  match_games: { game_no: number; team_a_score: number; team_b_score: number }[] | null;
};

const DEFAULT_RULES = { best_of: 1 as const, target_score: 11 as const, win_by: 2 as const };

function rulesFor(divisionId: string | null, divisions: DivisionRow[]) {
  if (!divisionId) return DEFAULT_RULES;
  const d = divisions.find((dd) => dd.id === divisionId);
  if (!d) return DEFAULT_RULES;
  return { best_of: d.best_of, target_score: d.target_score, win_by: d.win_by };
}

export default async function TournamentDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();

  const [
    { data: tournament },
    { data: divisions },
    { data: players },
    { data: matches },
    { data: userData },
  ] = await Promise.all([
    supabase.from('tournaments').select('*').eq('id', id).single(),
    supabase
      .from('divisions')
      .select('*')
      .eq('tournament_id', id)
      .order('created_at', { ascending: true }),
    supabase
      .from('tournament_players')
      .select('id,display_name,email,profile_id,division_id,created_at')
      .eq('tournament_id', id)
      .order('created_at', { ascending: true }),
    supabase
      .from('matches')
      .select(
        'id,round_label,court_label,team_a_label,team_b_label,team_a_score,team_b_score,winner_side,completed_at,division_id,match_games(game_no,team_a_score,team_b_score)',
      )
      .eq('tournament_id', id)
      .order('created_at', { ascending: true })
      .limit(500),
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
  const dvs = (divisions ?? []) as DivisionRow[];
  const p = (players ?? []) as PlayerRowData[];
  const m = (matches ?? []) as MatchRow[];

  const rosterCounts: Record<string, number> = {};
  let openCount = 0;
  for (const player of p) {
    if (player.division_id) {
      rosterCounts[player.division_id] = (rosterCounts[player.division_id] ?? 0) + 1;
    } else {
      openCount += 1;
    }
  }

  const divisionsForGenerate = dvs.map((d) => ({
    id: d.id,
    name: d.name,
    assignedPlayers: rosterCounts[d.id] ?? 0,
  }));
  const divisionsForRow = dvs.map((d) => ({ id: d.id, name: d.name }));

  // Group matches by division for display.
  const matchesByDivision = new Map<string | null, MatchRow[]>();
  for (const match of m) {
    const k = match.division_id;
    if (!matchesByDivision.has(k)) matchesByDivision.set(k, []);
    matchesByDivision.get(k)!.push(match);
  }

  const orderedGroups: { divisionId: string | null; name: string; rows: MatchRow[] }[] = [];
  if (matchesByDivision.has(null)) {
    orderedGroups.push({
      divisionId: null,
      name: 'Open / unassigned',
      rows: matchesByDivision.get(null)!,
    });
  }
  for (const d of dvs) {
    if (matchesByDivision.has(d.id)) {
      orderedGroups.push({
        divisionId: d.id,
        name: d.name,
        rows: matchesByDivision.get(d.id)!,
      });
    }
  }

  return (
    <div className="space-y-6">
      <section className="card p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-text-muted">Tournament</p>
            <h1 className="font-display text-3xl font-bold">{t.name}</h1>
            <p className="mt-1 text-sm text-text-muted">
              status: {t.status} - {p.length} player{p.length === 1 ? '' : 's'} - {m.length} match
              {m.length === 1 ? '' : 'es'} - {dvs.length} division{dvs.length === 1 ? '' : 's'}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link href={`/scoreboard/${t.id}`} className="btn btn-primary">
              Scoreboard
            </Link>
            <Link href="/tournaments" className="btn btn-ghost">
              Back
            </Link>
          </div>
        </div>
      </section>

      {sp.ok && (
        <div
          role="status"
          className="rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm text-emerald-300"
        >
          {sp.ok}
        </div>
      )}

      <DivisionsPanel
        tournamentId={t.id}
        divisions={dvs}
        canManage={canManage}
        rosterCounts={rosterCounts}
      />

      <section className="card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold">WhatsApp integration</h2>
            <p className="text-xs text-text-muted">Use a group chat instead of an in-app chat.</p>
          </div>
          {t.whatsapp_group_url && (
            <a
              className="btn btn-primary"
              href={t.whatsapp_group_url}
              target="_blank"
              rel="noreferrer"
            >
              Open group
            </a>
          )}
        </div>
        {canManage ? (
          <UpdateTournamentForm
            tournamentId={t.id}
            defaultName={t.name}
            defaultWhatsAppUrl={t.whatsapp_group_url}
          />
        ) : (
          <p className="text-sm text-text-muted">
            {t.whatsapp_group_url ? 'Tap above to open the group chat.' : 'No WhatsApp link set yet.'}
          </p>
        )}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold">Players</h2>
            <span className="text-xs text-text-muted">{p.length} total</span>
          </div>
          {canManage && <AddPlayerForm tournamentId={t.id} />}
          <div className="mt-4 space-y-2">
            {p.length === 0 ? (
              <p className="text-sm text-text-muted">No players yet.</p>
            ) : (
              p.map((player) => (
                <PlayerRow
                  key={player.id}
                  tournamentId={t.id}
                  playerId={player.id}
                  defaultName={player.display_name}
                  email={player.email}
                  linkedToProfile={!!player.profile_id}
                  canManage={canManage}
                  divisionId={player.division_id}
                  divisions={divisionsForRow}
                />
              ))
            )}
          </div>
        </div>

        <div className="card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold">Matches</h2>
            <span className="text-xs text-text-muted">{m.length} total</span>
          </div>
          {canManage && (
            <GenerateMatchesForm
              tournamentId={t.id}
              playerCount={p.length}
              openDivisionPlayerCount={openCount}
              divisions={divisionsForGenerate}
            />
          )}

          {orderedGroups.length === 0 ? (
            <p className="mt-4 text-sm text-text-muted">
              No matches yet. Add players, optionally split them into divisions, then generate.
            </p>
          ) : (
            orderedGroups.map((group) => {
              const rules = rulesFor(group.divisionId, dvs);
              const pending = group.rows.filter((r) => !r.completed_at);
              const finals = group.rows.filter((r) => r.completed_at);
              return (
                <div key={group.divisionId ?? 'open'} className="mt-5">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-volt">{group.name}</h3>
                  <p className="text-xs text-text-muted">
                    Best of {rules.best_of} to {rules.target_score} (win by {rules.win_by})
                  </p>

                  {pending.length === 0 ? (
                    <p className="mt-2 text-sm text-text-muted">All matches in this group are scored.</p>
                  ) : (
                    <ul className="mt-2 space-y-2">
                      {pending.map((match) => {
                        const games: GameInput[] = (match.match_games ?? [])
                          .sort((x, y) => x.game_no - y.game_no)
                          .map((g) => ({ team_a_score: g.team_a_score, team_b_score: g.team_b_score }));
                        return (
                          <li key={match.id} className="rounded-md border border-border-dark bg-dark-bg px-3 py-2">
                            <p className="text-xs uppercase tracking-wider text-text-muted">
                              {match.round_label ?? 'Round'} - {match.court_label ?? 'Court'}
                            </p>
                            <p className="mt-1 font-medium">
                              {match.team_a_label} <span className="text-text-muted">vs</span> {match.team_b_label}
                            </p>
                            {canManage && (
                              <div className="mt-2">
                                <ScoreMatchForm
                                  tournamentId={t.id}
                                  matchId={match.id}
                                  bestOf={rules.best_of}
                                  targetScore={rules.target_score}
                                  winBy={rules.win_by}
                                  defaultGames={games}
                                />
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  {finals.length > 0 && (
                    <details className="mt-3">
                      <summary className="cursor-pointer text-xs uppercase tracking-wider text-text-muted">
                        Completed ({finals.length})
                      </summary>
                      <ul className="mt-2 space-y-2">
                        {finals.map((match) => (
                          <li key={match.id} className="rounded-md border border-border-dark bg-dark-bg px-3 py-2">
                            <p className="text-xs uppercase tracking-wider text-text-muted">
                              {match.round_label ?? 'Round'} - {match.court_label ?? 'Court'}
                            </p>
                            <div className="mt-1 flex items-baseline justify-between gap-3">
                              <span className={match.winner_side === 'a' ? 'font-bold text-volt' : ''}>
                                {match.team_a_label}
                              </span>
                              <span className="font-display text-base font-semibold tabular-nums">
                                {(match.match_games ?? [])
                                  .sort((x, y) => x.game_no - y.game_no)
                                  .map((g) => `${g.team_a_score}-${g.team_b_score}`)
                                  .join(', ') || `${match.team_a_score ?? '?'}-${match.team_b_score ?? '?'}`}
                              </span>
                              <span className={match.winner_side === 'b' ? 'font-bold text-volt' : ''}>
                                {match.team_b_label}
                              </span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
