'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { formatPgError } from '@/lib/forms';

// Post a court's final score from the desktop score→standings surface.
// Unlike scoreMixerCourt (which redirects back to the cockpit), this returns
// a result so the surface can play its optimistic re-sort animation and keep
// the organizer in place. Revalidates every downstream mixer surface.
export async function postCourtScore(input: {
  tournamentId: string;
  roundId: string;
  courtNo: number;
  waveNo: number;
  teamAScore: number;
  teamBScore: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { tournamentId, roundId, courtNo, waveNo, teamAScore, teamBScore } = input;
  if (!tournamentId || !roundId) return { ok: false, error: 'Missing identifiers' };

  const supabase = await createClient();
  const { error } = await supabase.rpc('app_mixer_score_court', {
    p_round_id: roundId,
    p_court_no: courtNo,
    p_wave_no: waveNo,
    p_team_a_score: teamAScore,
    p_team_b_score: teamBScore,
  });
  if (error) return { ok: false, error: formatPgError(error) };

  revalidatePath(`/tournaments/${tournamentId}/mixer/score`);
  revalidatePath(`/tournaments/${tournamentId}/mixer`);
  revalidatePath(`/tournaments/${tournamentId}/mixer/admin`);
  revalidatePath(`/tournaments/${tournamentId}/mixer/present`);
  return { ok: true };
}
