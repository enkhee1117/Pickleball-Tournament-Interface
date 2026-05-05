'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { formatPgError } from '@/lib/forms';
import { propagateSemiOutcome } from '@/lib/playoffs-server';
import { refreshTournamentStatus } from '@/lib/tournament-status-server';

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

  const tournamentId = existing.tournament_id as string;

  // Use the RPC so RLS + standings stay correct. The score-entry screen
  // captures a single game; pass it as a one-game match.
  const { error } = await supabase.rpc('app_score_match_v2', {
    p_match_id: matchId,
    p_games: [[scoreA, scoreB]],
  });
  if (error) return { ok: false, error: formatPgError(error) };

  // If this was a semifinal, splice the winner/loser into the Final and
  // 3rd-place rows so the bracket UI keeps moving forward.
  await propagateSemiOutcome(supabase, tournamentId, matchId);
  await refreshTournamentStatus(supabase, tournamentId);

  revalidatePath(`/tournaments/${tournamentId}`);
  // Sibling match pages cache their own siblings query — invalidate the
  // whole match subtree so the very next "Score next match" landing sees
  // this match as completed and skips it.
  revalidatePath(`/tournaments/${tournamentId}/match/[matchId]`, 'page');
  revalidatePath('/tournaments');
  revalidatePath('/');
  revalidatePath('/history');
  return { ok: true };
}

export async function claimMatchPlayer({
  playerId,
  matchId,
}: {
  playerId: string;
  matchId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sign in to claim a slot.' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .single();
  const profileName = (profile?.display_name ?? '').trim();
  if (profileName.length < 2) {
    return { ok: false, error: 'Set your display name on /profile first.' };
  }

  const { data: matchRow } = await supabase
    .from('matches')
    .select('tournament_id')
    .eq('id', matchId)
    .single();
  const tournamentId = matchRow?.tournament_id as string | undefined;

  const { error } = await supabase.rpc('app_claim_tournament_player_with_name', {
    p_player_id: playerId,
    p_display_name: profileName,
  });
  if (error) return { ok: false, error: formatPgError(error) };

  if (tournamentId) {
    revalidatePath(`/tournaments/${tournamentId}`);
    revalidatePath(`/tournaments/${tournamentId}/invite`);
    revalidatePath(`/tournaments/${tournamentId}/match/[matchId]`, 'page');
  }
  revalidatePath('/history');
  return { ok: true };
}
