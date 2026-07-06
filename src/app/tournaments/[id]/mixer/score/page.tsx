import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { THEME_COOKIE, readThemeFromCookie } from '@/lib/theme';
import { currentMixerRound, sortMixerRounds } from '@/lib/mixer-rounds';
import type { PlayerRow, RoundRow, TournamentRow } from '../_types';
import { buildCourtResults } from '@/lib/mixer-standings';
import { ScoreFlow } from './ScoreFlow';

type PageProps = { params: Promise<{ id: string }> };

export default async function MixerScorePage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const user = await getCurrentUser();
  const store = await cookies();
  const theme = readThemeFromCookie(store.get(THEME_COOKIE)?.value);

  const [{ data: tournament }, { data: member }, { data: rounds }, { data: players }] = await Promise.all([
    supabase.from('tournaments').select('id,name,format,owner_user_id,status,invite_code').eq('id', id).single(),
    user
      ? supabase.from('tournament_members').select('role').eq('tournament_id', id).eq('user_id', user.id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('mixer_rounds').select('id,round_no,state,lock_at').eq('tournament_id', id).order('round_no', { ascending: true }),
    supabase.from('tournament_players').select('id,display_name,gender,profile_id,withdrawn_at').eq('tournament_id', id).order('created_at', { ascending: true }),
  ]);

  if (!tournament) notFound();
  const t = tournament as TournamentRow;
  if (t.format !== 'partner_mixer') notFound();
  const role = (member as { role?: string } | null)?.role ?? null;
  const isManager = !!user && (user.id === t.owner_user_id || role === 'organizer' || role === 'admin');
  if (!isManager) notFound();

  const roundRows = sortMixerRounds((rounds ?? []) as RoundRow[]);
  const currentRound = currentMixerRound(roundRows);
  const roster = (players ?? []) as PlayerRow[];
  const roundIds = roundRows.map((r) => r.id);

  const [{ data: pairings }, { data: scores }, { data: snapshot }] = await Promise.all([
    roundIds.length
      ? supabase.from('mixer_pairings').select('id,created_at,round_id,player_a_id,player_b_id,court_no,wave_no').in('round_id', roundIds)
      : Promise.resolve({ data: [] }),
    roundIds.length
      ? supabase.from('mixer_scores').select('round_id,court_no,wave_no,team_a_score,team_b_score,completed_at').in('round_id', roundIds)
      : Promise.resolve({ data: [] }),
    // The event's final snapshot, if any — its existence is the "standings are
    // final" signal that locks the board and reveals the podium.
    supabase.from('mixer_final_snapshots').select('tournament_id').eq('tournament_id', id).maybeSingle(),
  ]);

  const pairingRows = (pairings ?? []) as { round_id: string; player_a_id: string; player_b_id: string; court_no: number; wave_no: number }[];
  const scoreRows = (scores ?? []) as { round_id: string; court_no: number; wave_no: number; team_a_score: number; team_b_score: number; completed_at: string | null }[];
  const roundNoById = new Map(roundRows.map((r) => [r.id, r.round_no] as const));
  const nameOf = (pid: string) => roster.find((p) => p.id === pid)?.display_name ?? 'TBD';

  // Wave-aware: a game is one (round, court, wave) slot with two teams.
  const results = buildCourtResults(pairingRows, scoreRows, roundNoById, currentRound?.id ?? null, nameOf);

  const playerCount = roster.length;
  const finalized = !!snapshot;
  // Gender per player for the by-gender podium (open-mode events simply won't
  // split). Keyed by player id.
  const genders: Record<string, PlayerRow['gender']> = {};
  for (const p of roster) genders[p.id] = p.gender;

  return (
    <ScoreFlow
      theme={theme}
      tournamentId={id}
      tournamentName={t.name}
      roundNo={currentRound?.round_no ?? 0}
      roundsTotal={roundRows.length}
      roundState={currentRound?.state ?? 'setup'}
      playerCount={playerCount}
      results={results}
      finalized={finalized}
      genders={genders}
    />
  );
}
