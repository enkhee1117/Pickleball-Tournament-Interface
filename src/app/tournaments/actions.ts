'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { fieldInt, fieldString, formatPgError, type FormState } from '@/lib/forms';
import {
  normalizeWhatsAppUrl,
  validateOptionalEmail,
  validatePlayerCount,
  validatePlayerName,
  validateTournamentFormat,
  validateTournamentName,
  validateWhatsAppUrl,
} from '@/lib/validation';
import { generateMatchDrafts, type MatchScheme } from '@/lib/match-schemes';

async function getAuthedClient() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function createTournament(_prev: FormState, formData: FormData): Promise<FormState> {
  const name = fieldString(formData, 'name');
  const format = fieldString(formData, 'format') || 'round_robin';
  const whatsappRaw = fieldString(formData, 'whatsapp_group_url');
  const playerCount = fieldInt(formData, 'player_count', 0, 0, 64);

  const checks = [
    validateTournamentName(name),
    validateTournamentFormat(format),
    validateWhatsAppUrl(whatsappRaw),
    validatePlayerCount(playerCount),
  ];
  for (const c of checks) if (!c.ok) return { error: c.error };

  const { supabase, user } = await getAuthedClient();
  if (!user) return { error: 'Please sign in to create a tournament.' };

  const { data: newId, error } = await supabase.rpc('app_create_tournament', {
    p_name: name,
    p_format: format,
    p_whatsapp_group_url: normalizeWhatsAppUrl(whatsappRaw),
    p_player_count: playerCount,
  });

  if (error) return { error: formatPgError(error) };

  revalidatePath('/tournaments');
  revalidatePath('/');
  redirect(`/tournaments/${newId as string}?ok=Tournament%20created`);
}

export async function updateTournament(_prev: FormState, formData: FormData): Promise<FormState> {
  const tournamentId = fieldString(formData, 'tournament_id');
  const name = fieldString(formData, 'name');
  const whatsappRaw = fieldString(formData, 'whatsapp_group_url');

  if (!tournamentId) return { error: 'Missing tournament id.' };
  const checks = [validateTournamentName(name), validateWhatsAppUrl(whatsappRaw)];
  for (const c of checks) if (!c.ok) return { error: c.error };

  const { supabase, user } = await getAuthedClient();
  if (!user) return { error: 'Please sign in to update this tournament.' };

  const { error } = await supabase.rpc('app_update_tournament', {
    p_tournament_id: tournamentId,
    p_name: name,
    p_whatsapp_group_url: normalizeWhatsAppUrl(whatsappRaw),
  });
  if (error) return { error: formatPgError(error) };

  revalidatePath(`/tournaments/${tournamentId}`);
  revalidatePath('/tournaments');
  return { ok: 'Saved.' };
}

export async function addTournamentPlayer(_prev: FormState, formData: FormData): Promise<FormState> {
  const tournamentId = fieldString(formData, 'tournament_id');
  const displayName = fieldString(formData, 'display_name');
  const email = fieldString(formData, 'email');

  if (!tournamentId) return { error: 'Missing tournament id.' };
  for (const c of [validatePlayerName(displayName), validateOptionalEmail(email)]) {
    if (!c.ok) return { error: c.error };
  }

  const { supabase, user } = await getAuthedClient();
  if (!user) return { error: 'Please sign in.' };

  const { error } = await supabase.rpc('app_add_tournament_player', {
    p_tournament_id: tournamentId,
    p_display_name: displayName,
    p_email: email || null,
  });
  if (error) return { error: formatPgError(error) };

  revalidatePath(`/tournaments/${tournamentId}`);
  return { ok: 'Player added.' };
}

export async function renameTournamentPlayer(_prev: FormState, formData: FormData): Promise<FormState> {
  const playerId = fieldString(formData, 'player_id');
  const tournamentId = fieldString(formData, 'tournament_id');
  const displayName = fieldString(formData, 'display_name');

  if (!playerId || !tournamentId) return { error: 'Missing identifiers.' };
  const c = validatePlayerName(displayName);
  if (!c.ok) return { error: c.error };

  const { supabase, user } = await getAuthedClient();
  if (!user) return { error: 'Please sign in.' };

  const { error } = await supabase.rpc('app_rename_tournament_player', {
    p_player_id: playerId,
    p_display_name: displayName,
  });
  if (error) return { error: formatPgError(error) };

  revalidatePath(`/tournaments/${tournamentId}`);
  return { ok: 'Saved.' };
}

export async function removeTournamentPlayer(_prev: FormState, formData: FormData): Promise<FormState> {
  const playerId = fieldString(formData, 'player_id');
  const tournamentId = fieldString(formData, 'tournament_id');
  if (!playerId || !tournamentId) return { error: 'Missing identifiers.' };

  const { supabase, user } = await getAuthedClient();
  if (!user) return { error: 'Please sign in.' };

  const { error } = await supabase.rpc('app_remove_tournament_player', { p_player_id: playerId });
  if (error) return { error: formatPgError(error) };

  revalidatePath(`/tournaments/${tournamentId}`);
  return { ok: 'Player removed.' };
}

export async function generateMatches(_prev: FormState, formData: FormData): Promise<FormState> {
  const tournamentId = fieldString(formData, 'tournament_id');
  const divisionIdRaw = fieldString(formData, 'division_id');
  const divisionId = divisionIdRaw && divisionIdRaw !== 'open' ? divisionIdRaw : null;
  const scheme = (fieldString(formData, 'scheme') || 'rotating_partners') as MatchScheme;
  const courts = fieldInt(formData, 'courts', 2, 1, 16);
  const rounds = fieldInt(formData, 'rounds', 5, 1, 50);
  const confirmWipe = fieldString(formData, 'confirm_wipe') === '1';

  if (!tournamentId) return { error: 'Missing tournament id.' };
  if (!['rotating_partners', 'fixed_partners', 'single_elimination'].includes(scheme)) {
    return { error: 'Pick a valid generation scheme.' };
  }

  const { supabase, user } = await getAuthedClient();
  if (!user) return { error: 'Please sign in.' };

  // Server-side check: how many pending matches will be wiped?
  let pendingQuery = supabase
    .from('matches')
    .select('id', { head: true, count: 'exact' })
    .eq('tournament_id', tournamentId)
    .is('completed_at', null);
  pendingQuery = divisionId
    ? pendingQuery.eq('division_id', divisionId)
    : pendingQuery.is('division_id', null);
  const { count: pendingCount } = await pendingQuery;
  if ((pendingCount ?? 0) > 0 && !confirmWipe) {
    return {
      error: `${pendingCount} pending match${pendingCount === 1 ? '' : 'es'} would be deleted. Tick the confirmation checkbox to continue.`,
    };
  }

  const { data: roster, error: rosterErr } = await supabase
    .from('tournament_players')
    .select('display_name,division_id')
    .eq('tournament_id', tournamentId)
    .order('created_at', { ascending: true });
  if (rosterErr) return { error: formatPgError(rosterErr) };

  const filtered = (roster ?? []).filter((r) => {
    const rd = (r as { division_id: string | null }).division_id;
    return divisionId ? rd === divisionId : rd === null;
  });
  const players = filtered.map((r) => r.display_name as string).filter(Boolean);

  if (players.length < 4)
    return {
      error: divisionId
        ? 'This division needs at least 4 assigned players to generate doubles matches.'
        : 'Add at least 4 players (or assign them to a division) before generating matches.',
    };
  if (scheme !== 'rotating_partners' && players.length % 2 !== 0) {
    return { error: 'This scheme needs an even number of players (each team is two).' };
  }

  const drafts =
    scheme === 'rotating_partners'
      ? generateMatchDrafts({ scheme, players, rounds, courts })
      : scheme === 'fixed_partners'
        ? generateMatchDrafts({ scheme, players, courts })
        : generateMatchDrafts({ scheme, players, courts });

  if (drafts.length === 0) return { error: 'No matches were produced for that scheme.' };

  const { data: count, error } = await supabase.rpc('app_replace_pending_matches', {
    p_tournament_id: tournamentId,
    p_division_id: divisionId,
    p_matches: drafts,
  });
  if (error) return { error: formatPgError(error) };

  revalidatePath(`/tournaments/${tournamentId}`);
  revalidatePath('/scoreboard');
  revalidatePath(`/scoreboard/${tournamentId}`);
  return { ok: `Generated ${count ?? drafts.length} matches.` };
}

// Score a match using per-game scores. Reads up to 5 (game1_a, game1_b, ...
// game5_a, game5_b) form fields. Empty rows are ignored. Sending zero rows
// clears the match back to "pending".
export async function scoreMatch(_prev: FormState, formData: FormData): Promise<FormState> {
  const matchId = fieldString(formData, 'match_id');
  const tournamentId = fieldString(formData, 'tournament_id');
  if (!matchId || !tournamentId) return { error: 'Missing identifiers.' };

  const games: [number, number][] = [];
  for (let i = 1; i <= 5; i += 1) {
    const aRaw = fieldString(formData, `g${i}_a`);
    const bRaw = fieldString(formData, `g${i}_b`);
    if (aRaw === '' && bRaw === '') continue;
    if (aRaw === '' || bRaw === '') {
      return { error: `Game ${i}: enter both scores or leave both blank.` };
    }
    const a = Math.trunc(Number(aRaw));
    const b = Math.trunc(Number(bRaw));
    if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b < 0 || a > 99 || b > 99) {
      return { error: `Game ${i}: scores must be 0-99 integers.` };
    }
    games.push([a, b]);
  }

  const { supabase, user } = await getAuthedClient();
  if (!user) return { error: 'Please sign in.' };

  const { error } = await supabase.rpc('app_score_match_v2', {
    p_match_id: matchId,
    p_games: games,
  });
  if (error) return { error: formatPgError(error) };

  revalidatePath(`/tournaments/${tournamentId}`);
  revalidatePath(`/scoreboard/${tournamentId}`);
  revalidatePath('/scoreboard');
  revalidatePath('/');
  revalidatePath('/history');
  return { ok: 'Score saved.' };
}

export async function editMatch(_prev: FormState, formData: FormData): Promise<FormState> {
  const matchId = fieldString(formData, 'match_id');
  const tournamentId = fieldString(formData, 'tournament_id');
  const teamALabel = fieldString(formData, 'team_a_label');
  const teamBLabel = fieldString(formData, 'team_b_label');
  const roundLabel = fieldString(formData, 'round_label');
  const courtLabel = fieldString(formData, 'court_label');

  if (!matchId || !tournamentId) return { error: 'Missing identifiers.' };
  if (!teamALabel) return { error: 'Team A name is required.' };
  if (!teamBLabel) return { error: 'Team B name is required.' };

  const { supabase, user } = await getAuthedClient();
  if (!user) return { error: 'Please sign in.' };

  const { error } = await supabase
    .from('matches')
    .update({
      team_a_label: teamALabel,
      team_b_label: teamBLabel,
      round_label: roundLabel || null,
      court_label: courtLabel || null,
    })
    .eq('id', matchId)
    .eq('tournament_id', tournamentId)
    .is('completed_at', null);

  if (error) return { error: formatPgError(error) };

  revalidatePath(`/scoreboard/${tournamentId}`);
  revalidatePath(`/tournaments/${tournamentId}`);
  return { ok: 'Match updated.' };
}

// ---------------------------------------------------------------------------
// Divisions.
// ---------------------------------------------------------------------------

export async function createDivision(_prev: FormState, formData: FormData): Promise<FormState> {
  const tournamentId = fieldString(formData, 'tournament_id');
  const name = fieldString(formData, 'name');
  const format = fieldString(formData, 'format') || 'doubles';
  const gender = fieldString(formData, 'gender_constraint') || null;
  const skillMinRaw = fieldString(formData, 'skill_min');
  const skillMaxRaw = fieldString(formData, 'skill_max');
  const ageMinRaw = fieldString(formData, 'age_min');
  const ageMaxRaw = fieldString(formData, 'age_max');
  const bestOf = fieldInt(formData, 'best_of', 1, 1, 5);
  const target = fieldInt(formData, 'target_score', 11, 11, 21);
  const winBy = fieldInt(formData, 'win_by', 2, 1, 2);

  if (!tournamentId) return { error: 'Missing tournament id.' };
  if (!name) return { error: 'Division name is required.' };
  if (!['singles', 'doubles'].includes(format)) return { error: 'Format must be singles or doubles.' };
  if (![1, 3, 5].includes(bestOf)) return { error: 'Best-of must be 1, 3, or 5.' };
  if (![11, 15, 21].includes(target)) return { error: 'Target score must be 11, 15, or 21.' };

  const { supabase, user } = await getAuthedClient();
  if (!user) return { error: 'Please sign in.' };

  const { error } = await supabase.rpc('app_create_division', {
    p_tournament_id: tournamentId,
    p_name: name,
    p_format: format,
    p_gender: gender,
    p_skill_min: skillMinRaw ? Number(skillMinRaw) : null,
    p_skill_max: skillMaxRaw ? Number(skillMaxRaw) : null,
    p_age_min: ageMinRaw ? Math.trunc(Number(ageMinRaw)) : null,
    p_age_max: ageMaxRaw ? Math.trunc(Number(ageMaxRaw)) : null,
    p_best_of: bestOf,
    p_target_score: target,
    p_win_by: winBy,
  });
  if (error) return { error: formatPgError(error) };

  revalidatePath(`/tournaments/${tournamentId}`);
  revalidatePath(`/scoreboard/${tournamentId}`);
  return { ok: 'Division created.' };
}

export async function deleteDivision(_prev: FormState, formData: FormData): Promise<FormState> {
  const divisionId = fieldString(formData, 'division_id');
  const tournamentId = fieldString(formData, 'tournament_id');
  if (!divisionId || !tournamentId) return { error: 'Missing identifiers.' };

  const { supabase, user } = await getAuthedClient();
  if (!user) return { error: 'Please sign in.' };

  const { error } = await supabase.rpc('app_delete_division', { p_division_id: divisionId });
  if (error) return { error: formatPgError(error) };

  revalidatePath(`/tournaments/${tournamentId}`);
  revalidatePath(`/scoreboard/${tournamentId}`);
  return { ok: 'Division removed.' };
}

export async function assignPlayerDivision(_prev: FormState, formData: FormData): Promise<FormState> {
  const playerId = fieldString(formData, 'player_id');
  const tournamentId = fieldString(formData, 'tournament_id');
  const divisionIdRaw = fieldString(formData, 'division_id');
  if (!playerId || !tournamentId) return { error: 'Missing identifiers.' };

  const { supabase, user } = await getAuthedClient();
  if (!user) return { error: 'Please sign in.' };

  const { error } = await supabase.rpc('app_assign_player_division', {
    p_player_id: playerId,
    p_division_id: divisionIdRaw && divisionIdRaw !== 'open' ? divisionIdRaw : null,
  });
  if (error) return { error: formatPgError(error) };

  revalidatePath(`/tournaments/${tournamentId}`);
  revalidatePath(`/scoreboard/${tournamentId}`);
  return { ok: 'Saved.' };
}
