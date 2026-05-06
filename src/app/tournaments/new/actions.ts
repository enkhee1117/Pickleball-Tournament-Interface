'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { formatPgError } from '@/lib/forms';
import { validateTournamentFormat, validateTournamentName } from '@/lib/validation';
import { generateMatchDrafts } from '@/lib/match-schemes';
import {
  canGenerateMatches,
  dbFormat,
  genderModeFor,
  pickScheme,
  shouldAutoGenerate,
  type WizardFormat,
  type WizardPairing,
} from '@/lib/tournament-wizard';

type CreateInput = {
  name: string;
  format: WizardFormat | string;
  pairing?: WizardPairing;
  playerCount?: number;
  playerNames?: string[];
  courts?: number;
  rounds?: number;
};

type CreateResult =
  | { id: string; matchesGenerated: number; manualTeams: boolean; error?: undefined }
  | { id?: undefined; matchesGenerated?: undefined; manualTeams?: undefined; error: string };

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

  // Use the typed-name length when provided so seeded placeholders match the
  // count the user entered; we rename them right after creation.
  const cleanedNames = (input.playerNames ?? [])
    .map((n) => n.trim())
    .filter((n) => n.length > 0)
    .slice(0, 64);
  const seedCount = cleanedNames.length > 0 ? cleanedNames.length : (input.playerCount ?? 0);

  const { data: newId, error } = await supabase.rpc('app_create_tournament', {
    p_name: input.name,
    p_format: dbFmt,
    p_whatsapp_group_url: null,
    p_player_count: seedCount,
    p_gender_mode: genderModeFor(input.format),
  });

  if (error || !newId) {
    return { error: error ? formatPgError(error) : 'Could not create tournament.' };
  }
  const tournamentId = newId as string;

  if (cleanedNames.length > 0) {
    const { data: rosterRows } = await supabase
      .from('tournament_players')
      .select('id')
      .eq('tournament_id', tournamentId)
      .order('created_at', { ascending: true });
    const ids = (rosterRows ?? []).map((r) => (r as { id: string }).id);
    const renames = cleanedNames
      .slice(0, ids.length)
      .map((display_name, i) => ({ id: ids[i], display_name }));
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
  }

  const manualTeams = !shouldAutoGenerate(input.format, input.pairing);
  let matchesGenerated = 0;
  if (!manualTeams) {
    const { data: roster } = await supabase
      .from('tournament_players')
      .select('display_name')
      .eq('tournament_id', tournamentId)
      .order('created_at', { ascending: true });
    const players = ((roster ?? []) as { display_name: string }[])
      .map((r) => r.display_name)
      .filter(Boolean);

    if (canGenerateMatches(input.format, players.length)) {
      const scheme = pickScheme(input.format);
      const courts = Math.max(1, Math.min(16, input.courts ?? 2));
      const rounds = Math.max(1, Math.min(50, input.rounds ?? 5));

      const drafts =
        scheme === 'rotating_partners'
          ? generateMatchDrafts({ scheme, players, rounds, courts })
          : generateMatchDrafts({ scheme, players, courts });

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
