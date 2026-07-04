'use server';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { fieldInt, fieldString, formatPgError } from '@/lib/forms';
import { notifySeatedPlayers } from '@/lib/push/notify-seated';
import type { ConfigRow } from './_types';

function mixerPath(tournamentId: string) {
  return `/tournaments/${tournamentId}/mixer`;
}

function fieldNumber(formData: FormData, key: string, fallback: number, min: number, max: number): number {
  const raw = String(formData.get(key) ?? '').trim();
  const n = raw ? Number(raw) : fallback;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function fieldBool(formData: FormData, key: string): boolean {
  return formData.get(key) === 'on' || formData.get(key) === 'true';
}

function lockDurationSeconds(formData: FormData): number {
  const hours = fieldInt(formData, 'lock_hours', 24, 0, 168);
  const seconds = fieldInt(formData, 'lock_extra_seconds', 0, 0, 3599);
  return Math.max(5, Math.min(604800, hours * 3600 + seconds));
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

// notify.html touchpoint 2 — records the caller present at the event and, when
// a round is given, acknowledges that round's court call (silences the
// escalation chain). Returns rather than redirects so the client banner can
// dismiss in place; the present-between face-wall and other views pick up the
// new state via revalidation + realtime.
export async function checkInToMixer(
  tournamentId: string,
  roundId?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  if (!tournamentId) return { ok: false, error: 'Missing tournament.' };

  const supabase = await createClient();
  const { error } = await supabase.rpc('app_mixer_check_in', {
    p_tournament_id: tournamentId,
    p_round_id: roundId || null,
  });
  if (error) return { ok: false, error: formatPgError(error) };

  revalidatePath(mixerPath(tournamentId));
  revalidatePath(`${mixerPath(tournamentId)}/present/between`);
  return { ok: true };
}

export async function updateMixerConfig(formData: FormData): Promise<void> {
  const tournamentId = fieldString(formData, 'tournament_id');
  if (!tournamentId) redirect('/tournaments');

  const prizeBuckets = {
    tournament: fieldNumber(formData, 'bucket_tournament', 50, 0, 100) / 100,
    raffle: fieldNumber(formData, 'bucket_raffle', 20, 0, 100) / 100,
    betting: fieldNumber(formData, 'bucket_betting', 20, 0, 100) / 100,
    reserve: fieldNumber(formData, 'bucket_reserve', 10, 0, 100) / 100,
  };
  const paymentMethods = {
    zelle: { on: fieldBool(formData, 'pay_zelle_on'), handle: fieldString(formData, 'pay_zelle_handle') },
    venmo: { on: fieldBool(formData, 'pay_venmo_on'), handle: fieldString(formData, 'pay_venmo_handle') },
    cash: { on: fieldBool(formData, 'pay_cash_on'), handle: '' },
  };

  const supabase = await createClient();
  const { error } = await supabase.rpc('app_update_mixer_config', {
    p_tournament_id: tournamentId,
    p_starting_tokens: fieldInt(formData, 'starting_tokens', 10, 1, 100),
    p_starting_chips: fieldInt(formData, 'starting_chips', 100, 0, 100000),
    p_rounds: fieldInt(formData, 'rounds', 5, 1, 50),
    p_courts: fieldInt(formData, 'courts', 3, 1, 16),
    p_lock_mode: fieldString(formData, 'lock_mode') || 'timer',
    p_lock_seconds: lockDurationSeconds(formData),
    p_alpha: fieldNumber(formData, 'alpha', 1, 0, 100),
    p_beta: fieldNumber(formData, 'beta', 2.5, 0, 100),
    p_gamma: fieldNumber(formData, 'gamma', 1, 0, 100),
    p_tau: fieldNumber(formData, 'tau', 2, 0.01, 100),
    p_grief_floor: fieldNumber(formData, 'grief_floor', 4, 0, 100),
    p_repeat_decay: fieldNumber(formData, 'repeat_decay', 0.2, 0, 1),
    p_entry_fee: fieldNumber(formData, 'entry_fee', 20, 0, 100000),
    p_pay_to_play_enabled: fieldBool(formData, 'pay_to_play_enabled'),
    p_boost_tokens: fieldInt(formData, 'boost_tokens', 5, 0, 100),
    p_boost_price: fieldNumber(formData, 'boost_price', 20, 0, 100000),
    p_boost_limit: fieldInt(formData, 'boost_limit', 1, 0, 10),
    p_betting_enabled: fieldBool(formData, 'betting_enabled'),
    p_raffle_enabled: fieldBool(formData, 'raffle_enabled'),
    p_downvotes_enabled: fieldBool(formData, 'downvotes_enabled'),
    p_podium_markets: fieldInt(formData, 'podium_markets', 3, 1, 8),
    p_betting_prize_winners: fieldInt(formData, 'betting_prize_winners', 3, 1, 20),
    p_betting_rake_pct: fieldNumber(formData, 'betting_rake_pct', 0, 0, 100) / 100,
    p_prize_buckets: prizeBuckets,
    p_payment_methods: paymentMethods,
    p_raffle_prize: fieldString(formData, 'raffle_prize') || 'Raffle prize',
    p_upvote_cap: fieldInt(formData, 'upvote_cap_per_target', 3, 1, 99),
    p_bet_lock_round_no: (() => {
      const raw = String(formData.get('bet_lock_round_no') ?? '').trim();
      if (!raw) return null;
      const n = Number(raw);
      return Number.isFinite(n) && n >= 1 ? Math.min(50, Math.trunc(n)) : null;
    })(),
    p_clear_bet_lock_round: !String(formData.get('bet_lock_round_no') ?? '').trim(),
  });
  if (error) redirect(`${mixerPath(tournamentId)}/admin?error=${encodeURIComponent(formatPgError(error))}`);

  revalidatePath(mixerPath(tournamentId));
  revalidatePath(`${mixerPath(tournamentId)}/admin`);
  revalidatePath(`${mixerPath(tournamentId)}/present`);
  redirect(`${mixerPath(tournamentId)}/admin?ok=Mixer%20configuration%20saved`);
}

export async function updateMixerPlayerPool(formData: FormData): Promise<void> {
  const tournamentId = fieldString(formData, 'tournament_id');
  const playerId = fieldString(formData, 'player_id');
  const pool = fieldString(formData, 'pairing_pool');
  if (!tournamentId || !playerId || !pool) redirect('/tournaments');

  const supabase = await createClient();
  const { error } = await supabase.rpc('app_mixer_update_player_pool', {
    p_player_id: playerId,
    p_pairing_pool: pool,
  });
  if (error) redirect(`${mixerPath(tournamentId)}/admin?error=${encodeURIComponent(formatPgError(error))}`);

  revalidatePath(mixerPath(tournamentId));
  revalidatePath(`${mixerPath(tournamentId)}/admin`);
  redirect(`${mixerPath(tournamentId)}/admin?ok=Player%20pool%20updated`);
}

export async function setMixerVote(formData: FormData): Promise<void> {
  const tournamentId = fieldString(formData, 'tournament_id');
  const roundId = fieldString(formData, 'round_id');
  const voterPlayerId = fieldString(formData, 'voter_player_id');
  const targetPlayerId = fieldString(formData, 'target_player_id');
  const up = fieldInt(formData, 'up_tokens', 0, 0, 100);
  const down = fieldInt(formData, 'down_tokens', 0, 0, 100);
  const returnRound = fieldInt(formData, 'return_round', 0, 0, 1000);
  if (!tournamentId || !roundId || !voterPlayerId || !targetPlayerId) redirect('/tournaments');
  const returnPath = returnRound > 0 ? `${mixerPath(tournamentId)}?round=${returnRound}` : mixerPath(tournamentId);

  const supabase = await createClient();
  const { error } = await supabase.rpc('app_mixer_set_vote', {
    p_round_id: roundId,
    p_voter_player_id: voterPlayerId,
    p_target_player_id: targetPlayerId,
    p_up_tokens: up,
    p_down_tokens: down,
  });
  if (error) redirect(`${returnPath}${returnPath.includes('?') ? '&' : '?'}error=${encodeURIComponent(formatPgError(error))}`);

  // No redirect on success: the ballot updates optimistically on the client and
  // via realtime sync, so a redirect here would reload the whole page on every
  // single token tap. revalidatePath refreshes the server data in place.
  revalidatePath(mixerPath(tournamentId));
}

export async function updateMixerPlayerGender(formData: FormData): Promise<void> {
  const tournamentId = fieldString(formData, 'tournament_id');
  const playerId = fieldString(formData, 'player_id');
  const raw = fieldString(formData, 'gender').toLowerCase();
  const gender = raw === 'm' || raw === 'f' || raw === 'x' ? raw : null;
  if (!tournamentId || !playerId) redirect('/tournaments');

  const supabase = await createClient();
  // app_update_tournament_player overwrites every column, so read the current
  // row and change ONLY gender — a gender-only edit must not wipe email/phone/dupr.
  const { data: cur } = await supabase
    .from('tournament_players')
    .select('display_name,email,phone,dupr')
    .eq('id', playerId)
    .single();
  const { error } = await supabase.rpc('app_update_tournament_player', {
    p_player_id: playerId,
    p_display_name: cur?.display_name ?? 'Player',
    p_email: cur?.email ?? null,
    p_gender: gender,
    p_phone: cur?.phone ?? null,
    p_dupr: cur?.dupr ?? null,
  });
  if (error) redirect(`${mixerPath(tournamentId)}/admin?error=${encodeURIComponent(formatPgError(error))}`);

  // Re-pool to match the corrected gender so the ballot (which keys off the
  // server pairing_pool) shows the right side of a mixed draw. f → pool b, else a.
  if (gender) {
    await supabase.rpc('app_mixer_update_player_pool', {
      p_player_id: playerId,
      p_pairing_pool: gender === 'f' ? 'b' : 'a',
    });
  }

  revalidatePath(mixerPath(tournamentId));
  revalidatePath(`${mixerPath(tournamentId)}/admin`);
  redirect(`${mixerPath(tournamentId)}/admin?ok=Player%20gender%20updated`);
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
    p_lock_seconds: 86400,
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

// Quick voting-window control on the Run Event tab: set the lock window in
// HOURS and re-arm the current round's timer in one tap. Uses the partial
// update semantics of app_update_mixer_config (0045: null params keep their
// current values) so nothing else in the config is touched.
export async function setMixerVotingWindow(formData: FormData): Promise<void> {
  const tournamentId = fieldString(formData, 'tournament_id');
  const roundId = fieldString(formData, 'round_id');
  const hours = fieldInt(formData, 'lock_hours', 24, 1, 168);
  if (!tournamentId || !roundId) redirect('/tournaments');

  const supabase = await createClient();
  const { error } = await supabase.rpc('app_update_mixer_config', {
    p_tournament_id: tournamentId,
    p_lock_seconds: hours * 3600,
  });
  if (error) redirect(`${mixerPath(tournamentId)}/admin?error=${encodeURIComponent(formatPgError(error))}`);

  // Reopen (or re-arm) the round so lock_at picks up the new window.
  const { error: stateError } = await supabase.rpc('app_mixer_set_round_state', {
    p_round_id: roundId,
    p_state: 'open',
  });
  if (stateError) redirect(`${mixerPath(tournamentId)}/admin?error=${encodeURIComponent(formatPgError(stateError))}`);

  revalidatePath(mixerPath(tournamentId));
  revalidatePath(`${mixerPath(tournamentId)}/admin`);
  redirect(`${mixerPath(tournamentId)}/admin?ok=${encodeURIComponent(`Voting open for ${hours}h`)}`);
}

// Organizer recovery controls (migration 0048) — reopen a drawn round,
// wipe & refund a round's ballots, or reset the whole event for a rerun.
export async function reopenMixerRound(formData: FormData): Promise<void> {
  const tournamentId = fieldString(formData, 'tournament_id');
  const roundId = fieldString(formData, 'round_id');
  if (!tournamentId || !roundId) redirect('/tournaments');

  const supabase = await createClient();
  const { error } = await supabase.rpc('app_mixer_reopen_round', { p_round_id: roundId });
  if (error) redirect(`${mixerPath(tournamentId)}/admin?error=${encodeURIComponent(formatPgError(error))}`);

  revalidatePath(mixerPath(tournamentId));
  revalidatePath(`${mixerPath(tournamentId)}/admin`);
  redirect(`${mixerPath(tournamentId)}/admin?ok=${encodeURIComponent('Round reopened — pairings cleared, voting is live again')}`);
}

export async function resetMixerRoundVotes(formData: FormData): Promise<void> {
  const tournamentId = fieldString(formData, 'tournament_id');
  const roundId = fieldString(formData, 'round_id');
  if (!tournamentId || !roundId) redirect('/tournaments');

  const supabase = await createClient();
  const { error } = await supabase.rpc('app_mixer_reset_round_votes', { p_round_id: roundId });
  if (error) redirect(`${mixerPath(tournamentId)}/admin?error=${encodeURIComponent(formatPgError(error))}`);

  revalidatePath(mixerPath(tournamentId));
  revalidatePath(`${mixerPath(tournamentId)}/admin`);
  redirect(`${mixerPath(tournamentId)}/admin?ok=${encodeURIComponent('Ballots wiped and tokens refunded for this round')}`);
}

export async function resetMixerEvent(formData: FormData): Promise<void> {
  const tournamentId = fieldString(formData, 'tournament_id');
  if (!tournamentId) redirect('/tournaments');

  const supabase = await createClient();
  const { error } = await supabase.rpc('app_mixer_reset_event', { p_tournament_id: tournamentId });
  if (error) redirect(`${mixerPath(tournamentId)}/admin?error=${encodeURIComponent(formatPgError(error))}`);

  revalidatePath(mixerPath(tournamentId));
  revalidatePath(`${mixerPath(tournamentId)}/admin`);
  revalidatePath(`${mixerPath(tournamentId)}/present`);
  redirect(`${mixerPath(tournamentId)}/admin?ok=${encodeURIComponent('Event reset — all rounds reopened, tokens and chips restored')}`);
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

  // notify.html touchpoint 1 — the draw just seated players, so fire the
  // lock-screen "You're on Court N" push. Best-effort and quiet-hours aware
  // (only checked-in players in a live event). Runs AFTER the response is
  // sent so a slow push service never delays the organizer's redirect.
  after(() => notifySeatedPlayers(tournamentId, roundId));

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
  if (error) redirect(`${mixerPath(tournamentId)}?tab=betting&error=${encodeURIComponent(formatPgError(error))}`);

  revalidatePath(mixerPath(tournamentId));
  redirect(`${mixerPath(tournamentId)}?tab=betting&ok=Bet%20placed`);
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

// Toggle a single add-on flag from the dedicated Setup surface. Re-saves the
// full config with the current values so nothing else resets — only the one
// boolean flips. (updateMixerConfig reads every field, so a partial post
// would clobber the rest; this fetch-and-resave path is the safe one.)
const ADDON_COLUMN: Record<string, 'pay_to_play_enabled' | 'betting_enabled' | 'raffle_enabled' | 'downvotes_enabled'> = {
  boosts: 'pay_to_play_enabled',
  betting: 'betting_enabled',
  raffle: 'raffle_enabled',
  downvotes: 'downvotes_enabled',
};

export async function setMixerAddon(formData: FormData): Promise<void> {
  const tournamentId = fieldString(formData, 'tournament_id');
  if (!tournamentId) redirect('/tournaments');
  const setupPath = `${mixerPath(tournamentId)}/setup`;
  const column = ADDON_COLUMN[fieldString(formData, 'addon')];
  if (!column) redirect(setupPath);
  const enabled = fieldBool(formData, 'enabled');

  const supabase = await createClient();
  const { data } = await supabase.from('event_config').select('*').eq('tournament_id', tournamentId).maybeSingle();
  if (!data) redirect(`${setupPath}?error=${encodeURIComponent('Mixer config is not initialized yet')}`);
  const c = data as ConfigRow;
  const flags = {
    pay_to_play_enabled: c.pay_to_play_enabled,
    betting_enabled: c.betting_enabled,
    raffle_enabled: c.raffle_enabled,
    downvotes_enabled: c.downvotes_enabled,
    [column]: enabled,
  };

  const { error } = await supabase.rpc('app_update_mixer_config', {
    p_tournament_id: tournamentId,
    p_starting_tokens: c.starting_tokens,
    p_starting_chips: c.starting_chips,
    p_rounds: c.rounds,
    p_courts: c.courts,
    p_lock_mode: c.lock_mode,
    p_lock_seconds: c.lock_seconds,
    p_alpha: c.alpha,
    p_beta: c.beta,
    p_gamma: c.gamma,
    p_tau: c.tau,
    p_grief_floor: c.grief_floor,
    p_repeat_decay: c.repeat_decay,
    p_entry_fee: c.entry_fee,
    p_pay_to_play_enabled: flags.pay_to_play_enabled,
    p_boost_tokens: c.boost_tokens,
    p_boost_price: c.boost_price,
    p_boost_limit: c.boost_limit,
    p_betting_enabled: flags.betting_enabled,
    p_raffle_enabled: flags.raffle_enabled,
    p_downvotes_enabled: flags.downvotes_enabled,
    p_podium_markets: c.podium_markets,
    p_betting_prize_winners: c.betting_prize_winners,
    p_betting_rake_pct: c.betting_rake_pct,
    p_prize_buckets: c.prize_buckets,
    p_payment_methods: c.payment_methods,
    p_raffle_prize: c.raffle_prize,
    p_upvote_cap: c.upvote_cap_per_target ?? 3,
    p_bet_lock_round_no: c.bet_lock_round_no,
    p_clear_bet_lock_round: c.bet_lock_round_no == null,
  });
  if (error) redirect(`${setupPath}?error=${encodeURIComponent(formatPgError(error))}`);

  revalidatePath(setupPath);
  revalidatePath(`${mixerPath(tournamentId)}/admin`);
  redirect(`${setupPath}?ok=${encodeURIComponent('Add-on updated')}`);
}
