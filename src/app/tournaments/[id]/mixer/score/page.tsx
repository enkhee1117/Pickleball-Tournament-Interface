import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { THEME_COOKIE, readThemeFromCookie } from '@/lib/theme';
import { currentMixerRound, sortMixerRounds } from '@/lib/mixer-rounds';
import type { PairingRow, PlayerRow, RoundRow, TournamentRow } from '../_types';
import type { CourtResult } from './standings';
import { ScoreFlow } from './ScoreFlow';

type PageProps = { params: Promise<{ id: string }> };

type ScoreRowWithRound = {
  round_id: string;
  court_no: number;
  team_a_score: number;
  team_b_score: number;
  completed_at: string | null;
};

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

  const [{ data: pairings }, { data: scores }] = await Promise.all([
    roundIds.length
      ? supabase.from('mixer_pairings').select('id,round_id,player_a_id,player_b_id,court_no').in('round_id', roundIds)
      : Promise.resolve({ data: [] }),
    roundIds.length
      ? supabase.from('mixer_scores').select('round_id,court_no,team_a_score,team_b_score,completed_at').in('round_id', roundIds)
      : Promise.resolve({ data: [] }),
  ]);

  const pairingRows = (pairings ?? []) as (PairingRow & { round_id: string })[];
  const scoreRows = (scores ?? []) as ScoreRowWithRound[];
  const roundNoById = new Map(roundRows.map((r) => [r.id, r.round_no] as const));
  const nameOf = (pid: string) => roster.find((p) => p.id === pid)?.display_name ?? 'TBD';

  // Group pairings by (round, court); a court is a matchup once it has 2 teams.
  const byCourt = new Map<string, (PairingRow & { round_id: string })[]>();
  for (const p of pairingRows) {
    const key = `${p.round_id}:${p.court_no}`;
    byCourt.set(key, [...(byCourt.get(key) ?? []), p]);
  }

  const results: CourtResult[] = [];
  for (const [key, teams] of byCourt) {
    if (teams.length < 2) continue;
    const [teamA, teamB] = teams;
    const roundId = teamA.round_id;
    const courtNo = teamA.court_no;
    const score = scoreRows.find((s) => s.round_id === roundId && s.court_no === courtNo);
    results.push({
      key,
      roundId,
      roundNo: roundNoById.get(roundId) ?? 0,
      courtNo,
      teamA: [
        { id: teamA.player_a_id, name: nameOf(teamA.player_a_id) },
        { id: teamA.player_b_id, name: nameOf(teamA.player_b_id) },
      ],
      teamB: [
        { id: teamB.player_a_id, name: nameOf(teamB.player_a_id) },
        { id: teamB.player_b_id, name: nameOf(teamB.player_b_id) },
      ],
      scoreA: score?.team_a_score ?? 0,
      scoreB: score?.team_b_score ?? 0,
      completed: !!score?.completed_at,
      editable: !!currentRound && roundId === currentRound.id,
    });
  }
  results.sort((a, b) => a.roundNo - b.roundNo || a.courtNo - b.courtNo);

  const playerCount = roster.length;

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
    />
  );
}
