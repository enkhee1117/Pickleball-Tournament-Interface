'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { fieldInt, fieldString, formatPgError } from '@/lib/forms';

function mixerPath(tournamentId: string) {
  return `/tournaments/${tournamentId}/mixer`;
}

export async function bindMixerRosterEntry(formData: FormData): Promise<void> {
  const tournamentId = fieldString(formData, 'tournament_id');
  const displayName = fieldString(formData, 'display_name');
  if (!tournamentId) redirect('/tournaments');

  const supabase = await createClient();
  const { error } = await supabase.rpc('app_mixer_bind_roster_entry', {
    p_tournament_id: tournamentId,
    p_display_name: displayName || null,
  });
  if (error) redirect(`${mixerPath(tournamentId)}?error=${encodeURIComponent(formatPgError(error))}`);

  revalidatePath(mixerPath(tournamentId));
  redirect(mixerPath(tournamentId));
}

export async function setMixerVote(formData: FormData): Promise<void> {
  const tournamentId = fieldString(formData, 'tournament_id');
  const roundId = fieldString(formData, 'round_id');
  const voterPlayerId = fieldString(formData, 'voter_player_id');
  const targetPlayerId = fieldString(formData, 'target_player_id');
  const up = fieldInt(formData, 'up_tokens', 0, 0, 100);
  const down = fieldInt(formData, 'down_tokens', 0, 0, 100);
  if (!tournamentId || !roundId || !voterPlayerId || !targetPlayerId) redirect('/tournaments');

  const supabase = await createClient();
  const { error } = await supabase.rpc('app_mixer_set_vote', {
    p_round_id: roundId,
    p_voter_player_id: voterPlayerId,
    p_target_player_id: targetPlayerId,
    p_up_tokens: up,
    p_down_tokens: down,
  });
  if (error) redirect(`${mixerPath(tournamentId)}?error=${encodeURIComponent(formatPgError(error))}`);

  revalidatePath(mixerPath(tournamentId));
  redirect(mixerPath(tournamentId));
}

export async function setMixerRoundState(formData: FormData): Promise<void> {
  const tournamentId = fieldString(formData, 'tournament_id');
  const roundId = fieldString(formData, 'round_id');
  const state = fieldString(formData, 'state');
  if (!tournamentId || !roundId || !state) redirect('/tournaments');

  const supabase = await createClient();
  const { error } = await supabase.rpc('app_mixer_set_round_state', {
    p_round_id: roundId,
    p_state: state,
  });
  if (error) redirect(`${mixerPath(tournamentId)}/admin?error=${encodeURIComponent(formatPgError(error))}`);

  revalidatePath(mixerPath(tournamentId));
  revalidatePath(`${mixerPath(tournamentId)}/admin`);
  redirect(`${mixerPath(tournamentId)}/admin`);
}

export async function initializeMixerEvent(formData: FormData): Promise<void> {
  const tournamentId = fieldString(formData, 'tournament_id');
  if (!tournamentId) redirect('/tournaments');

  const supabase = await createClient();
  const { error } = await supabase.rpc('app_ensure_mixer_event', {
    p_tournament_id: tournamentId,
    p_starting_tokens: 10,
    p_starting_chips: 100,
    p_rounds: 5,
    p_courts: 3,
    p_lock_seconds: 90,
    p_entry_fee: 20,
    p_betting_enabled: true,
    p_raffle_enabled: true,
    p_downvotes_enabled: true,
  });
  if (error) redirect(`${mixerPath(tournamentId)}/admin?error=${encodeURIComponent(formatPgError(error))}`);

  revalidatePath(mixerPath(tournamentId));
  revalidatePath(`${mixerPath(tournamentId)}/admin`);
  redirect(`${mixerPath(tournamentId)}/admin?ok=Mixer%20initialized`);
}

export async function drawMixerRound(formData: FormData): Promise<void> {
  const tournamentId = fieldString(formData, 'tournament_id');
  const roundId = fieldString(formData, 'round_id');
  if (!tournamentId || !roundId) redirect('/tournaments');

  const supabase = await createClient();
  const { error } = await supabase.rpc('app_mixer_draw_round', {
    p_round_id: roundId,
  });
  if (error) redirect(`${mixerPath(tournamentId)}/admin?error=${encodeURIComponent(formatPgError(error))}`);

  revalidatePath(mixerPath(tournamentId));
  revalidatePath(`${mixerPath(tournamentId)}/admin`);
  revalidatePath(`${mixerPath(tournamentId)}/present`);
  redirect(`${mixerPath(tournamentId)}/admin?ok=Pairings%20revealed`);
}

export async function scoreMixerCourt(formData: FormData): Promise<void> {
  const tournamentId = fieldString(formData, 'tournament_id');
  const roundId = fieldString(formData, 'round_id');
  const courtNo = fieldInt(formData, 'court_no', 1, 1, 99);
  const scoreA = fieldInt(formData, 'team_a_score', 0, 0, 999);
  const scoreB = fieldInt(formData, 'team_b_score', 0, 0, 999);
  if (!tournamentId || !roundId) redirect('/tournaments');

  const supabase = await createClient();
  const { error } = await supabase.rpc('app_mixer_score_court', {
    p_round_id: roundId,
    p_court_no: courtNo,
    p_team_a_score: scoreA,
    p_team_b_score: scoreB,
  });
  if (error) redirect(`${mixerPath(tournamentId)}/admin?error=${encodeURIComponent(formatPgError(error))}`);

  revalidatePath(mixerPath(tournamentId));
  revalidatePath(`${mixerPath(tournamentId)}/admin`);
  redirect(`${mixerPath(tournamentId)}/admin?ok=Score%20posted`);
}

export async function placeMixerBet(formData: FormData): Promise<void> {
  const tournamentId = fieldString(formData, 'tournament_id');
  const bettorPlayerId = fieldString(formData, 'bettor_player_id');
  const pickPlayerId = fieldString(formData, 'pick_player_id');
  const marketPlace = fieldInt(formData, 'market_place', 1, 1, 8);
  const chips = fieldInt(formData, 'chips', 10, 1, 1000);
  if (!tournamentId || !bettorPlayerId || !pickPlayerId) redirect('/tournaments');

  const supabase = await createClient();
  const { error } = await supabase.rpc('app_mixer_place_bet', {
    p_tournament_id: tournamentId,
    p_bettor_player_id: bettorPlayerId,
    p_market_place: marketPlace,
    p_pick_player_id: pickPlayerId,
    p_chips: chips,
  });
  if (error) redirect(`${mixerPath(tournamentId)}?error=${encodeURIComponent(formatPgError(error))}`);

  revalidatePath(mixerPath(tournamentId));
  redirect(`${mixerPath(tournamentId)}?ok=Bet%20placed`);
}

export async function requestMixerPayment(formData: FormData): Promise<void> {
  const tournamentId = fieldString(formData, 'tournament_id');
  const playerId = fieldString(formData, 'player_id');
  const type = fieldString(formData, 'type');
  const method = fieldString(formData, 'method') || 'zelle';
  const reference = fieldString(formData, 'reference');
  if (!tournamentId || !playerId || !type) redirect('/tournaments');

  const supabase = await createClient();
  const { error } = await supabase.rpc('app_mixer_request_payment', {
    p_player_id: playerId,
    p_type: type,
    p_method: method,
    p_reference: reference || null,
  });
  if (error) redirect(`${mixerPath(tournamentId)}?tab=me&error=${encodeURIComponent(formatPgError(error))}`);

  revalidatePath(mixerPath(tournamentId));
  revalidatePath(`${mixerPath(tournamentId)}/admin`);
  redirect(`${mixerPath(tournamentId)}?tab=me&ok=Payment%20request%20sent`);
}

export async function confirmMixerPayment(formData: FormData): Promise<void> {
  const tournamentId = fieldString(formData, 'tournament_id');
  const paymentId = fieldString(formData, 'payment_id');
  const status = fieldString(formData, 'status') || 'confirmed';
  if (!tournamentId || !paymentId) redirect('/tournaments');

  const supabase = await createClient();
  const { error } = await supabase.rpc('app_mixer_confirm_payment', {
    p_payment_id: paymentId,
    p_status: status,
  });
  if (error) redirect(`${mixerPath(tournamentId)}/admin?error=${encodeURIComponent(formatPgError(error))}`);

  revalidatePath(`${mixerPath(tournamentId)}/admin`);
  revalidatePath(mixerPath(tournamentId));
  redirect(`${mixerPath(tournamentId)}/admin?ok=Payment%20updated`);
}

export async function finalizeMixerEvent(formData: FormData): Promise<void> {
  const tournamentId = fieldString(formData, 'tournament_id');
  if (!tournamentId) redirect('/tournaments');

  const supabase = await createClient();
  const { error } = await supabase.rpc('app_mixer_finalize_event', {
    p_tournament_id: tournamentId,
  });
  if (error) redirect(`${mixerPath(tournamentId)}/admin?error=${encodeURIComponent(formatPgError(error))}`);

  revalidatePath(mixerPath(tournamentId));
  revalidatePath(`${mixerPath(tournamentId)}/admin`);
  revalidatePath(`${mixerPath(tournamentId)}/present`);
  revalidatePath(`/tournaments/${tournamentId}`);
  redirect(`${mixerPath(tournamentId)}/admin?ok=Final%20snapshot%20created`);
}
