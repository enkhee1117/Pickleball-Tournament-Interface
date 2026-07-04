import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { currentMixerRound, sortMixerRounds } from '@/lib/mixer-rounds';
import {
  buildCourtResults,
  climbDeltas,
  latestScoredRound,
  standingsThroughRound,
} from '@/lib/mixer-standings';
import type { PairingRow, PlayerRow, RoundRow, TournamentRow } from '../../_types';
import { PresentBetween } from './PresentBetween';

type PageProps = { params: Promise<{ id: string }> };

type ScoreRowWithRound = {
  round_id: string;
  court_no: number;
  team_a_score: number;
  team_b_score: number;
  completed_at: string | null;
};

export default async function MixerPresentBetweenPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: tournament }, { data: rounds }, { data: players }] = await Promise.all([
    supabase.from('tournaments').select('id,name,format,status,invite_code,owner_user_id,gender_mode').eq('id', id).single(),
    supabase.from('mixer_rounds').select('id,round_no,state,lock_at').eq('tournament_id', id).order('round_no', { ascending: true }),
    supabase.from('tournament_players').select('id,display_name,gender,profile_id,withdrawn_at').eq('tournament_id', id).order('created_at', { ascending: true }),
  ]);

  if (!tournament) notFound();
  const t = tournament as TournamentRow;
  if (t.format !== 'partner_mixer') notFound();

  const roundRows = sortMixerRounds((rounds ?? []) as RoundRow[]);
  const currentRound = currentMixerRound(roundRows);
  const roster = (players ?? []) as PlayerRow[];
  const roundIds = roundRows.map((r) => r.id);

  const [{ data: pairings }, { data: scores }, { data: checkIns }] = await Promise.all([
    roundIds.length
      ? supabase.from('mixer_pairings').select('id,round_id,player_a_id,player_b_id,court_no').in('round_id', roundIds)
      : Promise.resolve({ data: [] }),
    roundIds.length
      ? supabase.from('mixer_scores').select('round_id,court_no,team_a_score,team_b_score,completed_at').in('round_id', roundIds)
      : Promise.resolve({ data: [] }),
    supabase.from('mixer_check_ins').select('player_id').eq('tournament_id', id),
  ]);

  const pairingRows = (pairings ?? []) as (PairingRow & { round_id: string })[];
  const scoreRows = (scores ?? []) as ScoreRowWithRound[];
  const roundNoById = new Map(roundRows.map((r) => [r.id, r.round_no] as const));
  const nameOf = (pid: string) => roster.find((p) => p.id === pid)?.display_name ?? 'TBD';
  const names = new Map(roster.map((p) => [p.id, p.display_name] as const));

  const results = buildCourtResults(pairingRows, scoreRows, roundNoById, currentRound?.id ?? null, nameOf);
  const scoredRound = latestScoredRound(results);
  const standings = standingsThroughRound(results, names, scoredRound).map((row, i) => ({
    rank: i + 1,
    playerId: row.playerId,
    name: row.name,
    wins: row.wins,
    losses: row.losses,
    points: row.points,
    pointDiff: row.pointDiff,
  }));
  const deltasMap = climbDeltas(results, names, scoredRound);
  const deltas: Record<string, number> = {};
  for (const [k, v] of deltasMap) deltas[k] = v;

  // "Checked in" for the holding face-wall = players who tapped "I'm here"
  // (real mixer_check_ins state), not merely whoever the last draw seated. A
  // player between rounds still reads as present once they've checked in.
  const checkedInIds = new Set((checkIns ?? []).map((row) => (row as { player_id: string }).player_id));
  const facewall = roster.map((p) => ({ id: p.id, name: p.display_name, checked: checkedInIds.has(p.id) }));

  const nextRoundNo = roundRows.find((r) => r.round_no === scoredRound + 1)?.round_no ?? null;

  return (
    <PresentBetween
      tournamentId={id}
      tournamentName={t.name}
      roundsTotal={roundRows.length}
      scoredRound={scoredRound}
      nextRoundNo={nextRoundNo}
      lockAt={currentRound?.lock_at ?? null}
      standings={standings}
      deltas={deltas}
      facewall={facewall}
    />
  );
}
