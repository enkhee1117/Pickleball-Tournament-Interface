'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { formatPgError } from '@/lib/forms';
import { normalizeWhatsAppUrl } from '@/lib/validation';
import {
  generateMatchDrafts,
  generateFixedPartnersFromTeams,
  type MatchDraft,
} from '@/lib/match-schemes';
import { canGenerateMatches, pickScheme } from '@/lib/tournament-wizard';
import { refreshTournamentStatus } from '@/lib/tournament-status-server';
import { titleCaseName } from '@/lib/text';
import { normalizeE164 } from '@/lib/phone';

// Thin wrappers around the RPC actions in @/app/tournaments/actions so the
// new invite UI can call them with a simple void/redirect interface instead
// of the FormState pattern used by useActionState elsewhere.

export type InviteeMatch = {
  user_id: string;
  display_name: string;
  phone: string | null;
  gender: 'm' | 'f' | 'x' | null;
  dupr: number | null;
};

export async function addInvitePlayer(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const tournamentId = String(formData.get('tournament_id') ?? '').trim();
  const displayName = titleCaseName(String(formData.get('display_name') ?? '').trim());
  const emailRaw = String(formData.get('email') ?? '').trim();
  const phoneRaw = String(formData.get('phone') ?? '').trim();
  const duprRaw = String(formData.get('dupr') ?? '').trim();
  const profileIdRaw = String(formData.get('user_id') ?? '').trim();
  if (!tournamentId || displayName.length < 2) {
    return { ok: false, error: 'Player name must be at least 2 characters.' };
  }
  if (emailRaw && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) {
    return { ok: false, error: 'Email looks invalid.' };
  }
  // Be lenient about formatting on input — accept "(555) 123-4567",
  // "+15551234567", "5551234567", etc. normalizeE164 returns null only
  // when the digits clearly aren't a valid number.
  const phoneNormalized = phoneRaw ? normalizeE164(phoneRaw) : null;
  if (phoneRaw && !phoneNormalized) {
    return { ok: false, error: "Phone doesn't look right — try +15551234567." };
  }
  let dupr: number | null = null;
  if (duprRaw) {
    const n = Number(duprRaw);
    if (!Number.isFinite(n) || n < 2 || n > 8) {
      return { ok: false, error: 'DUPR must be between 2 and 8.' };
    }
    dupr = Math.round(n * 100) / 100;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sign in required.' };

  const { data: newPlayerId, error } = await supabase.rpc('app_add_tournament_player', {
    p_tournament_id: tournamentId,
    p_display_name: displayName,
    p_email: emailRaw || null,
    p_phone: phoneNormalized,
    p_dupr: dupr,
  });
  if (error) return { ok: false, error: formatPgError(error) };

  // Typeahead pick → stamp profile_id directly. Phone-match in the RPC
  // misses profiles with no phone on file, which left these rows showing
  // as PENDING even though we knew exactly who they were.
  if (profileIdRaw && newPlayerId) {
    const { error: linkErr } = await supabase.rpc('app_link_tournament_player_to_profile', {
      p_player_id: newPlayerId,
      p_profile_id: profileIdRaw,
    });
    if (linkErr) return { ok: false, error: formatPgError(linkErr) };
  }

  revalidatePath(`/tournaments/${tournamentId}`);
  revalidatePath(`/tournaments/${tournamentId}/invite`);
  return { ok: true };
}

export async function searchInvitees(query: string): Promise<InviteeMatch[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase.rpc('app_search_player_invitees', {
    p_query: trimmed,
  });
  if (error || !data) return [];
  return (data as InviteeMatch[]).slice(0, 5);
}

export async function updateInvitePlayer(formData: FormData): Promise<void> {
  const tournamentId = String(formData.get('tournament_id') ?? '').trim();
  const playerId = String(formData.get('player_id') ?? '').trim();
  const displayName = titleCaseName(String(formData.get('display_name') ?? '').trim());
  const emailRaw = String(formData.get('email') ?? '').trim();
  const phoneRaw = String(formData.get('phone') ?? '').trim();
  const genderRaw = String(formData.get('gender') ?? '').trim().toLowerCase();
  const gender = genderRaw === 'm' || genderRaw === 'f' || genderRaw === 'x' ? genderRaw : null;
  const duprRaw = String(formData.get('dupr') ?? '').trim();
  let dupr: number | null = null;
  if (duprRaw) {
    const n = Number(duprRaw);
    if (Number.isFinite(n) && n >= 2 && n <= 8) {
      dupr = Math.round(n * 100) / 100;
    }
  }
  if (!tournamentId || !playerId) {
    redirect(`/tournaments/${tournamentId}/invite?error=Missing%20player%20id`);
  }
  if (displayName.length < 2) {
    redirect(
      `/tournaments/${tournamentId}/invite?error=${encodeURIComponent('Player name must be at least 2 characters.')}`,
    );
  }
  if (emailRaw && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) {
    redirect(
      `/tournaments/${tournamentId}/invite?error=${encodeURIComponent('Email looks invalid.')}`,
    );
  }
  // Accept loose phone formats — normalize before handing to the RPC, which
  // requires strict E.164.
  const phoneNormalized = phoneRaw ? normalizeE164(phoneRaw) : null;
  if (phoneRaw && !phoneNormalized) {
    redirect(
      `/tournaments/${tournamentId}/invite?error=${encodeURIComponent("Phone doesn't look right — try +15551234567.")}`,
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { error } = await supabase.rpc('app_update_tournament_player', {
    p_player_id: playerId,
    p_display_name: displayName,
    p_email: emailRaw || null,
    p_gender: gender,
    p_phone: phoneNormalized,
    p_dupr: dupr,
  });
  if (error) {
    redirect(
      `/tournaments/${tournamentId}/invite?error=${encodeURIComponent(formatPgError(error))}`,
    );
  }

  revalidatePath(`/tournaments/${tournamentId}`);
  revalidatePath(`/tournaments/${tournamentId}/invite`);
  redirect(`/tournaments/${tournamentId}/invite?ok=Player%20updated`);
}

// Self-unclaim: lets a user release a roster slot they accidentally
// claimed. Only the user currently linked can release the row.
export async function unclaimSelfPlayer(formData: FormData): Promise<void> {
  const tournamentId = String(formData.get('tournament_id') ?? '').trim();
  const playerId = String(formData.get('player_id') ?? '').trim();
  if (!tournamentId || !playerId) {
    redirect(`/tournaments/${tournamentId}?error=Missing%20identifiers`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { error } = await supabase.rpc('app_unclaim_self_from_player', {
    p_player_id: playerId,
  });
  if (error) {
    redirect(
      `/tournaments/${tournamentId}?error=${encodeURIComponent(formatPgError(error))}`,
    );
  }

  revalidatePath(`/tournaments/${tournamentId}`);
  revalidatePath(`/tournaments/${tournamentId}/invite`);
  revalidatePath('/history');
  redirect(
    `/tournaments/${tournamentId}?ok=${encodeURIComponent('Released your slot — pick the right one below.')}`,
  );
}

// Mid-tournament withdrawal. Manager flips the player to withdrawn and
// pending matches mentioning them auto-forfeit (11-0 to the other side).
// Idempotent on subsequent calls — re-running just no-ops.
export async function withdrawPlayer(formData: FormData): Promise<void> {
  const tournamentId = String(formData.get('tournament_id') ?? '').trim();
  const playerId = String(formData.get('player_id') ?? '').trim();
  if (!tournamentId || !playerId) {
    redirect(`/tournaments/${tournamentId}?error=Missing%20identifiers`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data, error } = await supabase.rpc('app_withdraw_player', {
    p_player_id: playerId,
  });
  if (error) {
    redirect(
      `/tournaments/${tournamentId}?error=${encodeURIComponent(formatPgError(error))}`,
    );
  }

  const forfeitCount = typeof data === 'number' ? data : 0;
  revalidatePath(`/tournaments/${tournamentId}`);
  revalidatePath(`/tournaments/${tournamentId}/invite`);
  revalidatePath('/history');
  const msg =
    forfeitCount === 0
      ? 'Player withdrawn. No pending matches to forfeit.'
      : `Player withdrawn. ${forfeitCount} pending match${forfeitCount === 1 ? '' : 'es'} forfeited.`;
  redirect(`/tournaments/${tournamentId}?ok=${encodeURIComponent(msg)}`);
}

// Undo a withdrawal. Only flips the flag — already-forfeited matches stay
// forfeited; manager can re-score them through the normal UI if the player
// actually came back.
export async function reinstatePlayer(formData: FormData): Promise<void> {
  const tournamentId = String(formData.get('tournament_id') ?? '').trim();
  const playerId = String(formData.get('player_id') ?? '').trim();
  if (!tournamentId || !playerId) {
    redirect(`/tournaments/${tournamentId}?error=Missing%20identifiers`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { error } = await supabase.rpc('app_reinstate_player', {
    p_player_id: playerId,
  });
  if (error) {
    redirect(
      `/tournaments/${tournamentId}?error=${encodeURIComponent(formatPgError(error))}`,
    );
  }

  revalidatePath(`/tournaments/${tournamentId}`);
  revalidatePath(`/tournaments/${tournamentId}/invite`);
  redirect(
    `/tournaments/${tournamentId}?ok=${encodeURIComponent('Player reinstated. Re-score forfeited matches in the scoreboard if needed.')}`,
  );
}

export async function claimInvitePlayer(formData: FormData): Promise<void> {
  const tournamentId = String(formData.get('tournament_id') ?? '').trim();
  const playerId = String(formData.get('player_id') ?? '').trim();
  if (!tournamentId || !playerId) {
    redirect(`/tournaments/${tournamentId}/invite?error=Missing%20identifiers`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .single();
  const profileName = (profile?.display_name ?? '').trim();
  if (profileName.length < 2) {
    redirect(
      `/tournaments/${tournamentId}/invite?error=${encodeURIComponent(
        'Set your display name on /profile before claiming a player.',
      )}`,
    );
  }

  const { error } = await supabase.rpc('app_claim_tournament_player_with_name', {
    p_player_id: playerId,
    p_display_name: profileName,
  });
  if (error) {
    redirect(
      `/tournaments/${tournamentId}/invite?error=${encodeURIComponent(formatPgError(error))}`,
    );
  }

  revalidatePath(`/tournaments/${tournamentId}`);
  revalidatePath(`/tournaments/${tournamentId}/invite`);
  revalidatePath(`/tournaments/${tournamentId}/match/[matchId]`, 'page');
  revalidatePath('/history');
  redirect(
    `/tournaments/${tournamentId}/invite?ok=${encodeURIComponent(`Linked as ${profileName}`)}`,
  );
}

export async function removeInvitePlayer(formData: FormData): Promise<void> {
  const tournamentId = String(formData.get('tournament_id') ?? '').trim();
  const playerId = String(formData.get('player_id') ?? '').trim();
  if (!tournamentId || !playerId) {
    redirect(`/tournaments/${tournamentId}/invite?error=Missing%20identifiers`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { error } = await supabase.rpc('app_remove_tournament_player', {
    p_player_id: playerId,
  });
  if (error) {
    redirect(
      `/tournaments/${tournamentId}/invite?error=${encodeURIComponent(formatPgError(error))}`,
    );
  }

  revalidatePath(`/tournaments/${tournamentId}`);
  revalidatePath(`/tournaments/${tournamentId}/invite`);
  redirect(`/tournaments/${tournamentId}/invite?ok=Player%20removed`);
}

export async function setInviteWhatsApp(formData: FormData): Promise<void> {
  const tournamentId = String(formData.get('tournament_id') ?? '').trim();
  const raw = String(formData.get('whatsapp_group_url') ?? '');
  const whatsapp = normalizeWhatsAppUrl(raw);
  if (!tournamentId) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: existing } = await supabase
    .from('tournaments')
    .select('name')
    .eq('id', tournamentId)
    .single();
  if (!existing) return;

  await supabase.rpc('app_update_tournament', {
    p_tournament_id: tournamentId,
    p_name: existing.name,
    p_whatsapp_group_url: whatsapp,
  });

  revalidatePath(`/tournaments/${tournamentId}`);
  revalidatePath(`/tournaments/${tournamentId}/invite`);
}

// Generate matches from the current roster using the tournament's stored
// format. Used by the "Generate matches" button on the invite page for
// round-robin and auto-paired fixed-partners flows.
export async function generateMatchesFromRoster(formData: FormData): Promise<void> {
  const tournamentId = String(formData.get('tournament_id') ?? '').trim();
  const courts = clampInt(formData.get('courts'), 2, 1, 16);
  const rounds = clampInt(formData.get('rounds'), 5, 1, 50);
  if (!tournamentId) {
    redirect(`/tournaments/${tournamentId}/invite?error=Missing%20tournament%20id`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [{ data: tournament }, { data: roster }] = await Promise.all([
    supabase
      .from('tournaments')
      .select('format,gender_mode,pairing_mode')
      .eq('id', tournamentId)
      .single(),
    supabase
      .from('tournament_players')
      .select('display_name,gender,dupr,withdrawn_at')
      .eq('tournament_id', tournamentId)
      .is('withdrawn_at', null)
      .order('created_at', { ascending: true }),
  ]);
  if (!tournament) {
    redirect(`/tournaments/${tournamentId}/invite?error=Tournament%20not%20found`);
  }
  const rosterRows = (roster ?? []) as {
    display_name: string;
    gender: 'm' | 'f' | 'x' | null;
    dupr: number | null;
    withdrawn_at: string | null;
  }[];
  const players = rosterRows.map((r) => r.display_name).filter(Boolean);
  const genders = rosterRows.map((r) => r.gender ?? null);
  const duprs = rosterRows.map((r) => (r.dupr != null ? Number(r.dupr) : null));
  const genderMode = (tournament as { gender_mode?: 'open' | 'mixed' | 'same' }).gender_mode ?? 'open';
  const pairingMode = (tournament as { pairing_mode?: 'random' | 'balanced' | 'snake' }).pairing_mode ?? 'random';

  if (genderMode === 'mixed' || genderMode === 'same') {
    const males = rosterRows.filter((r) => r.gender === 'm').length;
    const females = rosterRows.filter((r) => r.gender === 'f').length;
    if (males < 2 && females < 2) {
      redirect(
        `/tournaments/${tournamentId}/invite?error=${encodeURIComponent(
          'Mark each player as M or F in the roster (Settings tab) before generating mixed-doubles matches.',
        )}`,
      );
    }
  }

  if (!canGenerateMatches(tournament!.format, players.length)) {
    redirect(
      `/tournaments/${tournamentId}/invite?error=${encodeURIComponent(
        playerCountHint(tournament!.format, players.length),
      )}`,
    );
  }

  const scheme = pickScheme(tournament!.format);
  const drafts: MatchDraft[] =
    scheme === 'rotating_partners'
      ? generateMatchDrafts({
          scheme,
          players,
          rounds,
          courts,
          genderMode,
          genders,
          pairingMode,
          duprs,
        })
      : generateMatchDrafts({ scheme, players, courts, genderMode, genders });

  if (drafts.length === 0) {
    redirect(
      `/tournaments/${tournamentId}/invite?error=${encodeURIComponent('No matches were produced for that roster.')}`,
    );
  }

  const { data: count, error } = await supabase.rpc('app_replace_pending_matches', {
    p_tournament_id: tournamentId,
    p_division_id: null,
    p_matches: drafts,
  });
  if (error) {
    redirect(`/tournaments/${tournamentId}/invite?error=${encodeURIComponent(formatPgError(error))}`);
  }

  await refreshTournamentStatus(supabase, tournamentId);
  revalidatePath(`/tournaments/${tournamentId}`);
  revalidatePath(`/tournaments/${tournamentId}/invite`);
  redirect(
    `/tournaments/${tournamentId}?ok=${encodeURIComponent(`Generated ${count ?? drafts.length} matches`)}`,
  );
}

// Generate matches for fixed partners using a manually composed team list.
// Expects the form to include one or more `pairs` entries shaped as
// "playerIdA,playerIdB" (the order matters — it becomes the team's display
// label "Alice & Bob").
export async function generateManualMatchesFromRoster(formData: FormData): Promise<void> {
  const tournamentId = String(formData.get('tournament_id') ?? '').trim();
  const courts = clampInt(formData.get('courts'), 2, 1, 16);
  const pairs = formData.getAll('pairs').map((v) => String(v).trim()).filter(Boolean);

  if (!tournamentId) {
    redirect(`/tournaments/${tournamentId}/invite?error=Missing%20tournament%20id`);
  }
  if (pairs.length < 2) {
    redirect(
      `/tournaments/${tournamentId}/invite?error=${encodeURIComponent('Pair at least two teams before generating matches.')}`,
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: rosterRows } = await supabase
    .from('tournament_players')
    .select('id,display_name')
    .eq('tournament_id', tournamentId);
  const byId = new Map(
    ((rosterRows ?? []) as { id: string; display_name: string }[]).map((r) => [r.id, r.display_name]),
  );

  const teamLabels: string[] = [];
  const seen = new Set<string>();
  for (const pair of pairs) {
    const [a, b] = pair.split(',').map((s) => s.trim());
    if (!a || !b || a === b) {
      redirect(
        `/tournaments/${tournamentId}/invite?error=${encodeURIComponent('Each team needs two distinct players.')}`,
      );
    }
    if (seen.has(a) || seen.has(b)) {
      redirect(
        `/tournaments/${tournamentId}/invite?error=${encodeURIComponent('A player can only be on one team.')}`,
      );
    }
    seen.add(a);
    seen.add(b);
    const aName = byId.get(a);
    const bName = byId.get(b);
    if (!aName || !bName) {
      redirect(
        `/tournaments/${tournamentId}/invite?error=${encodeURIComponent('A selected player is no longer on the roster.')}`,
      );
    }
    teamLabels.push(`${aName} & ${bName}`);
  }

  const drafts = generateFixedPartnersFromTeams(teamLabels, { courts });
  if (drafts.length === 0) {
    redirect(
      `/tournaments/${tournamentId}/invite?error=${encodeURIComponent('Need at least two teams to generate matches.')}`,
    );
  }

  const { data: count, error } = await supabase.rpc('app_replace_pending_matches', {
    p_tournament_id: tournamentId,
    p_division_id: null,
    p_matches: drafts,
  });
  if (error) {
    redirect(`/tournaments/${tournamentId}/invite?error=${encodeURIComponent(formatPgError(error))}`);
  }

  await refreshTournamentStatus(supabase, tournamentId);
  revalidatePath(`/tournaments/${tournamentId}`);
  revalidatePath(`/tournaments/${tournamentId}/invite`);
  redirect(
    `/tournaments/${tournamentId}?ok=${encodeURIComponent(`Generated ${count ?? drafts.length} matches`)}`,
  );
}

function clampInt(raw: FormDataEntryValue | null, fallback: number, min: number, max: number): number {
  const n = Math.trunc(Number(String(raw ?? '').trim()));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function playerCountHint(format: string, count: number): string {
  if (count < 4) return 'Add at least 4 players before generating matches.';
  if (format === 'fixed_partners' && count % 2 !== 0) {
    return 'Fixed partners needs an even number of players.';
  }
  return 'Roster cannot produce matches with the current settings.';
}
