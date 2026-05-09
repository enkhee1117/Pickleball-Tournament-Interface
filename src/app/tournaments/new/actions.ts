'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { formatPgError } from '@/lib/forms';
import { validateTournamentFormat, validateTournamentName } from '@/lib/validation';
import { generateMatchDrafts } from '@/lib/match-schemes';
import { normalizeE164 } from '@/lib/phone';
import { titleCaseName } from '@/lib/text';
import {
  canGenerateMatches,
  dbFormat,
  genderModeFor,
  pickScheme,
  shouldAutoGenerate,
  type WizardFormat,
  type WizardPairing,
} from '@/lib/tournament-wizard';

export type WizardPlayerInput = {
  name: string;
  gender?: 'm' | 'f' | 'x' | null;
  phone?: string | null;
  dupr?: number | null;
  // When the user picked a registered profile via typeahead, this is set
  // so the server can stamp profile_id directly instead of relying on the
  // phone-match heuristic — which fails when the profile has no phone.
  profileId?: string | null;
};

type CreateInput = {
  name: string;
  format: WizardFormat | string;
  pairing?: WizardPairing;
  playerCount?: number;
  // Preferred: rich per-player metadata. Falls back to playerNames for
  // older callers and the placeholder flow.
  players?: WizardPlayerInput[];
  playerNames?: string[];
  courts?: number;
  rounds?: number;
};

type CreateResult =
  | { id: string; matchesGenerated: number; manualTeams: boolean; error?: undefined }
  | { id?: undefined; matchesGenerated?: undefined; manualTeams?: undefined; error: string };

type CleanPlayer = {
  name: string;
  gender: 'm' | 'f' | 'x' | null;
  phone: string | null;
  dupr: number | null;
  profileId: string | null;
};

function cleanPlayers(input: CreateInput): CleanPlayer[] {
  if (input.players && input.players.length > 0) {
    return input.players
      .map((p) => {
        const name = titleCaseName((p.name ?? '').trim());
        if (!name) return null;
        const phoneRaw = (p.phone ?? '').trim();
        const phone = phoneRaw ? normalizeE164(phoneRaw) : null;
        const gender = p.gender === 'm' || p.gender === 'f' || p.gender === 'x' ? p.gender : null;
        const dupr =
          typeof p.dupr === 'number' && Number.isFinite(p.dupr) && p.dupr >= 2 && p.dupr <= 8
            ? Math.round(p.dupr * 100) / 100
            : null;
        const profileId = typeof p.profileId === 'string' && p.profileId.length > 0 ? p.profileId : null;
        return { name, gender, phone, dupr, profileId };
      })
      .filter((p): p is CleanPlayer => p !== null)
      .slice(0, 64);
  }
  return (input.playerNames ?? [])
    .map((n) => titleCaseName(n.trim()))
    .filter((n) => n.length > 0)
    .slice(0, 64)
    .map((name) => ({ name, gender: null, phone: null, dupr: null, profileId: null }));
}

export async function createTournamentClient(input: CreateInput): Promise<CreateResult> {
  const dbFmt = dbFormat(input.format);
  for (const c of [validateTournamentName(input.name), validateTournamentFormat(dbFmt)]) {
    if (!c.ok) return { error: c.error };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'Please sign in to create a tournament.' };
  }

  const players = cleanPlayers(input);
  const seedCount = players.length > 0 ? players.length : (input.playerCount ?? 0);

  const { data: newId, error } = await supabase.rpc('app_create_tournament', {
    p_name: input.name,
    p_format: dbFmt,
    p_whatsapp_group_url: null,
    p_player_count: seedCount,
    p_gender_mode: genderModeFor(input.format),
    // Wizard pairings 'balanced' / 'snake' / 'random' map directly to the
    // tournament-level pairing_mode; 'manual' (fp-only) doesn't generate
    // matches automatically so any value is fine — store 'random'.
    p_pairing_mode:
      input.pairing === 'balanced' || input.pairing === 'snake' ? input.pairing : 'random',
  });

  if (error || !newId) {
    return { error: error ? formatPgError(error) : 'Could not create tournament.' };
  }
  const tournamentId = newId as string;

  if (players.length > 0) {
    const { data: rosterRows } = await supabase
      .from('tournament_players')
      .select('id')
      .eq('tournament_id', tournamentId)
      .order('created_at', { ascending: true });
    const ids = (rosterRows ?? []).map((r) => (r as { id: string }).id);
    const renames = players
      .slice(0, ids.length)
      .map((p, i) => ({ id: ids[i], display_name: p.name }));
    if (renames.length > 0) {
      const { error: bulkErr } = await supabase.rpc('app_bulk_rename_tournament_players', {
        p_tournament_id: tournamentId,
        p_renames: renames,
      });
      if (bulkErr) {
        revalidatePath('/tournaments');
        return { id: tournamentId, matchesGenerated: 0, manualTeams: false };
      }
    }

    // Persist phone / gender / dupr per row when the wizard collected any.
    // app_update_tournament_player auto-links by phone (matching profiles)
    // so users entered with a registered phone get linked on creation.
    const writes = players.slice(0, ids.length).map((p, i) => {
      const hasMeta = !!p.phone || !!p.gender || p.dupr !== null;
      if (!hasMeta) return null;
      return supabase.rpc('app_update_tournament_player', {
        p_player_id: ids[i],
        p_display_name: p.name,
        p_email: null,
        p_gender: p.gender,
        p_phone: p.phone,
        p_dupr: p.dupr,
      });
    });
    await Promise.all(writes.filter((w): w is NonNullable<typeof w> => w !== null));

    // Stamp profile_id directly for any row that came from a typeahead
    // pick — phone matching alone misses profiles that don't have a phone
    // on file, so this is the authoritative link.
    const links = players.slice(0, ids.length).map((p, i) => {
      if (!p.profileId) return null;
      return supabase.rpc('app_link_tournament_player_to_profile', {
        p_player_id: ids[i],
        p_profile_id: p.profileId,
      });
    });
    await Promise.all(links.filter((l): l is NonNullable<typeof l> => l !== null));
  }

  const manualTeams = !shouldAutoGenerate(input.format, input.pairing);
  let matchesGenerated = 0;
  if (!manualTeams) {
    const { data: roster } = await supabase
      .from('tournament_players')
      .select('display_name,gender,dupr')
      .eq('tournament_id', tournamentId)
      .order('created_at', { ascending: true });
    const rosterRows = (roster ?? []) as {
      display_name: string;
      gender: 'm' | 'f' | 'x' | null;
      dupr: number | null;
    }[];
    const playerNames = rosterRows.map((r) => r.display_name).filter(Boolean);
    const genders = rosterRows.map((r) => r.gender ?? null);
    const duprs = rosterRows.map((r) => (r.dupr != null ? Number(r.dupr) : null));
    const genderMode = genderModeFor(input.format);
    const pairingMode: 'random' | 'balanced' | 'snake' =
      input.pairing === 'balanced' || input.pairing === 'snake' ? input.pairing : 'random';

    if (canGenerateMatches(input.format, playerNames.length)) {
      const scheme = pickScheme(input.format);
      const courts = Math.max(1, Math.min(16, input.courts ?? 2));
      const rounds = Math.max(1, Math.min(50, input.rounds ?? 5));

      const drafts =
        scheme === 'rotating_partners'
          ? generateMatchDrafts({
              scheme,
              players: playerNames,
              rounds,
              courts,
              genderMode,
              genders,
              pairingMode,
              duprs,
            })
          : generateMatchDrafts({ scheme, players: playerNames, courts });

      if (drafts.length > 0) {
        const { data: count, error: genErr } = await supabase.rpc('app_replace_pending_matches', {
          p_tournament_id: tournamentId,
          p_division_id: null,
          p_matches: drafts,
        });
        if (!genErr) {
          matchesGenerated = (count as number | null) ?? drafts.length;
        }
      }
    }
  }

  revalidatePath('/tournaments');
  revalidatePath(`/tournaments/${tournamentId}`);
  return { id: tournamentId, matchesGenerated, manualTeams };
}
