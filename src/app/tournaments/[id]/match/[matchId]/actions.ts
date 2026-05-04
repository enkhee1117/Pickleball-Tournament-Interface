'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { formatPgError } from '@/lib/forms';

export async function saveMatchScore({
  matchId,
  scoreA,
  scoreB,
}: {
  matchId: string;
  scoreA: number;
  scoreB: number;
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in' };

  const { data: existing, error: fetchError } = await supabase
    .from('matches')
    .select('tournament_id')
    .eq('id', matchId)
    .single();
  if (fetchError || !existing) return { ok: false, error: 'Match not found' };

  // Use main's RPC so RLS + standings stay correct. The score-entry screen
  // captures a single game; pass it as a one-game match.
  const { error } = await supabase.rpc('app_score_match_v2', {
    p_match_id: matchId,
    p_games: [[scoreA, scoreB]],
  });
  if (error) return { ok: false, error: formatPgError(error) };

  revalidatePath(`/tournaments/${existing.tournament_id}`);
  return { ok: true };
}
