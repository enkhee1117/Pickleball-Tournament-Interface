'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { fieldString, formatPgError } from '@/lib/forms';
import { generateSimBallot } from '@/lib/mixer-sim';
import type { MixerPool } from '@/lib/mixer';

// ---------------------------------------------------------------------------
// Organizer test harness — simulate the parts of a mixer that normally need
// many separate logins. Every write goes through a manager-gated RPC
// (app_mixer_admin_set_ballot / app_require_tournament_manager), so these are
// safe to expose on the admin cockpit: a non-manager caller is refused by the
// database regardless of the UI.
// ---------------------------------------------------------------------------

function mixerAdmin(tournamentId: string) {
  return `/tournaments/${tournamentId}/mixer/admin`;
}

type Roster = { id: string; gender: 'm' | 'f' | 'x' | null; withdrawn_at: string | null }[];
type States = { player_id: string; pairing_pool: MixerPool; tokens_base_remaining: number; tokens_bought_remaining: number }[];

// Fill blind ballots for players in the current OPEN round. `onlyMissing` skips
// anyone who already has votes this round (so it tops up absentees without
// touching real voters). Returns how many ballots were written.
export async function simulateRoundVotes(input: {
  tournamentId: string;
  roundId: string;
  onlyMissing?: boolean;
  spendFraction?: number;
}): Promise<{ ok: boolean; filled: number; error?: string }> {
  const { tournamentId, roundId, onlyMissing = true, spendFraction = 1 } = input;
  if (!tournamentId || !roundId) return { ok: false, filled: 0, error: 'Missing identifiers.' };

  const supabase = await createClient();
  const [{ data: tournament }, { data: players }, { data: states }, { data: existingVotes }] = await Promise.all([
    supabase.from('tournaments').select('gender_mode').eq('id', tournamentId).single(),
    supabase.from('tournament_players').select('id,gender,withdrawn_at').eq('tournament_id', tournamentId),
    supabase.from('player_event_state').select('player_id,pairing_pool,tokens_base_remaining,tokens_bought_remaining').eq('tournament_id', tournamentId),
    supabase.from('mixer_votes').select('voter_player_id').eq('round_id', roundId),
  ]);

  const genderMode = (tournament as { gender_mode: string | null } | null)?.gender_mode ?? 'open';
  const roster = (players ?? []) as Roster;
  const stateRows = (states ?? []) as States;
  const stateOf = new Map(stateRows.map((s) => [s.player_id, s] as const));
  const alreadyVoted = new Set(((existingVotes ?? []) as { voter_player_id: string }[]).map((v) => v.voter_player_id));

  // Candidates for eligibility filtering: every active player (id + gender).
  const candidates = roster.filter((p) => !p.withdrawn_at).map((p) => ({ id: p.id, gender: p.gender }));

  let filled = 0;
  const errors: string[] = [];
  for (const p of roster) {
    if (p.withdrawn_at) continue;
    const state = stateOf.get(p.id);
    if (!state) continue;
    if (onlyMissing && alreadyVoted.has(p.id)) continue;
    const available = state.tokens_base_remaining + state.tokens_bought_remaining;
    const ballot = generateSimBallot({
      voter: { id: p.id, gender: p.gender, pool: state.pairing_pool },
      roster: candidates,
      genderMode,
      availableTokens: available,
      spendFraction,
    });
    if (ballot.length === 0) continue;
    const { error } = await supabase.rpc('app_mixer_admin_set_ballot', {
      p_round_id: roundId,
      p_voter_player_id: p.id,
      p_ballot: ballot,
      p_confirmed: true,
    });
    if (error) {
      errors.push(formatPgError(error));
      // A manager-permission or lock error will repeat for every player — stop early.
      if (/permission|manager|locked|not authorized/i.test(error.message ?? '')) break;
    } else {
      filled += 1;
    }
  }

  if (filled === 0 && errors.length > 0) return { ok: false, filled, error: errors[0] };
  return { ok: true, filled };
}

// Form wrapper for the admin cockpit. mode 'missing' tops up absentees; mode
// 'all' first wipes+refunds the round's ballots then fills everyone fresh.
export async function simulateRoundVotesAction(formData: FormData): Promise<void> {
  const tournamentId = fieldString(formData, 'tournament_id');
  const roundId = fieldString(formData, 'round_id');
  const mode = fieldString(formData, 'mode') || 'missing';
  if (!tournamentId || !roundId) redirect('/tournaments');

  const supabase = await createClient();

  if (mode === 'all') {
    const { error } = await supabase.rpc('app_mixer_reset_round_votes', { p_round_id: roundId });
    if (error) redirect(`${mixerAdmin(tournamentId)}?error=${encodeURIComponent(formatPgError(error))}`);
  }

  const res = await simulateRoundVotes({ tournamentId, roundId, onlyMissing: true });

  revalidatePath(mixerAdmin(tournamentId));
  revalidatePath(`/tournaments/${tournamentId}/mixer`);
  if (!res.ok) {
    redirect(`${mixerAdmin(tournamentId)}?error=${encodeURIComponent(res.error ?? 'Could not simulate votes')}`);
  }
  redirect(`${mixerAdmin(tournamentId)}?ok=${encodeURIComponent(`Simulated ${res.filled} ballot${res.filled === 1 ? '' : 's'}`)}`);
}

// ---------------------------------------------------------------------------
// Auto-play: score rounds and drive a whole night without courtside input.
// ---------------------------------------------------------------------------

type SupabaseServer = Awaited<ReturnType<typeof createClient>>;

// A valid pickleball game: first to 11, win by 2. Random winner, loser 0–9.
function randomGameScore(): { a: number; b: number } {
  const aWins = Math.random() < 0.5;
  const loser = Math.floor(Math.random() * 10);
  return aWins ? { a: 11, b: loser } : { a: loser, b: 11 };
}

// Post a random final for every real game slot (court + wave with two teams) in
// a drawn round. Byes (a slot with a single team) are skipped — nothing to play.
async function autoScoreRound(
  supabase: SupabaseServer,
  roundId: string,
): Promise<{ scored: number; error?: string }> {
  const { data: pairings } = await supabase
    .from('mixer_pairings')
    .select('court_no,wave_no')
    .eq('round_id', roundId);

  const counts = new Map<string, { courtNo: number; waveNo: number; teams: number }>();
  for (const p of (pairings ?? []) as { court_no: number; wave_no: number }[]) {
    const key = `${p.court_no}:${p.wave_no}`;
    const cur = counts.get(key);
    counts.set(key, { courtNo: p.court_no, waveNo: p.wave_no, teams: (cur?.teams ?? 0) + 1 });
  }

  let scored = 0;
  let firstError: string | undefined;
  for (const slot of counts.values()) {
    if (slot.teams < 2) continue; // bye — no game to score
    const score = randomGameScore();
    const { error } = await supabase.rpc('app_mixer_score_court', {
      p_round_id: roundId,
      p_court_no: slot.courtNo,
      p_wave_no: slot.waveNo,
      p_team_a_score: score.a,
      p_team_b_score: score.b,
    });
    if (error) firstError ??= formatPgError(error);
    else scored += 1;
  }
  return { scored, error: firstError };
}

// Vote for EVERY still-open round in one pass. Locking is global in this mixer
// (app_mixer_set_round_state locks every open round at once — "all ballots lock
// together"), so once any round is locked no round can be voted again. Auto-play
// therefore has to fill every round's ballot up front, while they're all open,
// or later rounds draw with no votes. onlyMissing keeps real votes intact.
async function simulateAllOpenRounds(
  supabase: SupabaseServer,
  tournamentId: string,
  spendFraction: number,
): Promise<void> {
  const { data: rounds } = await supabase
    .from('mixer_rounds')
    .select('id,round_no,state')
    .eq('tournament_id', tournamentId)
    .order('round_no', { ascending: true });
  for (const r of ((rounds ?? []) as { id: string; round_no: number; state: string }[])) {
    if (r.state !== 'open') continue;
    await simulateRoundVotes({ tournamentId, roundId: r.id, onlyMissing: true, spendFraction });
  }
}

// Advance the current (lowest not-done) round through whatever steps remain:
// open → simulate votes → lock → draw → score → done. Resilient to a partial
// state (e.g. already locked or revealed). Returns done:true when every round
// is finished. spendFraction spreads each player's whole-event token budget
// across rounds so later rounds still have votes to cast.
async function advanceCurrentRound(
  supabase: SupabaseServer,
  tournamentId: string,
  spendFraction: number,
): Promise<{ done: boolean; roundNo?: number; error?: string }> {
  const { data: rounds } = await supabase
    .from('mixer_rounds')
    .select('id,round_no,state')
    .eq('tournament_id', tournamentId)
    .order('round_no', { ascending: true });

  const round = ((rounds ?? []) as { id: string; round_no: number; state: string }[]).find((r) => r.state !== 'done');
  if (!round) return { done: true };

  if (round.state === 'open') {
    const sim = await simulateRoundVotes({ tournamentId, roundId: round.id, onlyMissing: true, spendFraction });
    if (!sim.ok && sim.filled === 0 && sim.error) return { done: false, error: sim.error };
    const { error } = await supabase.rpc('app_mixer_set_round_state', { p_round_id: round.id, p_state: 'locked' });
    if (error) return { done: false, error: formatPgError(error) };
    round.state = 'locked';
  }

  if (round.state === 'locked' || round.state === 'drawing') {
    const { error } = await supabase.rpc('app_mixer_draw_round', { p_round_id: round.id });
    // A round already drawn (harmless) raises 55000 / "already been drawn".
    if (error && !/already been drawn/i.test(error.message ?? '')) return { done: false, error: formatPgError(error) };
    round.state = 'revealed';
  }

  const scoreResult = await autoScoreRound(supabase, round.id);
  if (scoreResult.scored === 0 && scoreResult.error) return { done: false, error: scoreResult.error };

  const { error: doneError } = await supabase.rpc('app_mixer_set_round_state', { p_round_id: round.id, p_state: 'done' });
  if (doneError) return { done: false, error: formatPgError(doneError) };

  return { done: false, roundNo: round.round_no };
}

// Play the current round to completion (one click on the cockpit).
export async function playRoundAction(formData: FormData): Promise<void> {
  const tournamentId = fieldString(formData, 'tournament_id');
  if (!tournamentId) redirect('/tournaments');

  const supabase = await createClient();
  const { data: cfg } = await supabase.from('event_config').select('rounds').eq('tournament_id', tournamentId).maybeSingle();
  const roundsTotal = (cfg as { rounds: number } | null)?.rounds ?? 5;
  const spendFraction = Math.max(0.15, 1 / roundsTotal);
  // Vote all open rounds before this play locks them all (global lock).
  await simulateAllOpenRounds(supabase, tournamentId, spendFraction);
  const step = await advanceCurrentRound(supabase, tournamentId, spendFraction);

  revalidatePath(mixerAdmin(tournamentId));
  revalidatePath(`/tournaments/${tournamentId}/mixer`);
  revalidatePath(`/tournaments/${tournamentId}/mixer/present`);
  if (step.error) redirect(`${mixerAdmin(tournamentId)}?error=${encodeURIComponent(step.error)}`);
  redirect(`${mixerAdmin(tournamentId)}?ok=${encodeURIComponent(step.done ? 'All rounds already played' : `Round ${step.roundNo} simulated end to end`)}`);
}

// Play every remaining round, then finalize standings/raffle/pools.
export async function runFullAutoNight(
  tournamentId: string,
): Promise<{ ok: boolean; roundsPlayed: number; error?: string }> {
  const supabase = await createClient();
  const { data: cfg } = await supabase.from('event_config').select('rounds').eq('tournament_id', tournamentId).maybeSingle();
  const roundsTotal = (cfg as { rounds: number } | null)?.rounds ?? 5;
  const spendFraction = Math.max(0.15, 1 / roundsTotal);

  // Fill every round's ballot before the first (global) lock — see
  // simulateAllOpenRounds. Without this, only round 1 would carry votes.
  await simulateAllOpenRounds(supabase, tournamentId, spendFraction);

  let roundsPlayed = 0;
  // Guard well above any real round count so a stuck state can't loop forever.
  for (let guard = 0; guard < 100; guard += 1) {
    const step = await advanceCurrentRound(supabase, tournamentId, spendFraction);
    if (step.error) return { ok: false, roundsPlayed, error: step.error };
    if (step.done) break;
    roundsPlayed += 1;
  }

  const { error } = await supabase.rpc('app_mixer_finalize_event', { p_tournament_id: tournamentId });
  if (error) return { ok: false, roundsPlayed, error: formatPgError(error) };
  return { ok: true, roundsPlayed };
}

export async function autoNightAction(formData: FormData): Promise<void> {
  const tournamentId = fieldString(formData, 'tournament_id');
  if (!tournamentId) redirect('/tournaments');

  const res = await runFullAutoNight(tournamentId);

  revalidatePath(mixerAdmin(tournamentId));
  revalidatePath(`/tournaments/${tournamentId}/mixer`);
  revalidatePath(`/tournaments/${tournamentId}/mixer/present`);
  revalidatePath(`/tournaments/${tournamentId}/recap`);
  if (!res.ok) redirect(`${mixerAdmin(tournamentId)}?error=${encodeURIComponent(res.error ?? 'Auto-night failed')}`);
  redirect(`${mixerAdmin(tournamentId)}?ok=${encodeURIComponent(`Played ${res.roundsPlayed} rounds → finalized`)}`);
}

// One click: create a brand-new mixer with a full placeholder roster and run the
// entire night (votes → draws → scores → finals) so the organizer can inspect
// every surface end to end. Redirects to the new tournament's cockpit.
export async function seedTestTournamentAction(formData: FormData): Promise<void> {
  const name = (fieldString(formData, 'name') || 'Test Mixer').slice(0, 80);
  const rawCount = Number(fieldString(formData, 'player_count') || '16');
  const playerCount = Math.max(4, Math.min(32, Number.isFinite(rawCount) ? Math.trunc(rawCount) : 16));
  const rawMode = fieldString(formData, 'gender_mode');
  const genderMode = rawMode === 'same' || rawMode === 'open' ? rawMode : 'mixed';

  const supabase = await createClient();
  const { data: newId, error: createError } = await supabase.rpc('app_create_tournament', {
    p_name: name,
    p_format: 'partner_mixer',
    p_whatsapp_group_url: null,
    p_player_count: playerCount,
    p_gender_mode: genderMode,
    p_pairing_mode: 'random',
  });
  if (createError || !newId) {
    redirect(`/tournaments?error=${encodeURIComponent(createError ? formatPgError(createError) : 'Could not create test tournament')}`);
  }
  const tournamentId = newId as string;

  const { error: ensureError } = await supabase.rpc('app_ensure_mixer_event', {
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
  if (ensureError) {
    redirect(`${mixerAdmin(tournamentId)}?error=${encodeURIComponent(formatPgError(ensureError))}`);
  }

  const res = await runFullAutoNight(tournamentId);

  revalidatePath('/tournaments');
  revalidatePath(mixerAdmin(tournamentId));
  if (!res.ok) {
    redirect(`${mixerAdmin(tournamentId)}?error=${encodeURIComponent(`Seeded roster but auto-night stopped: ${res.error ?? 'unknown'}`)}`);
  }
  redirect(`${mixerAdmin(tournamentId)}?ok=${encodeURIComponent(`Seeded ${playerCount}-player mixer and played ${res.roundsPlayed} rounds → finals`)}`);
}
