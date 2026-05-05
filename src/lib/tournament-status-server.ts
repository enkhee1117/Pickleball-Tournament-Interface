// Tournament lifecycle status transitions.
//
// status flows: draft → active → completed
//
// Rules:
// - draft: nothing scheduled yet (zero matches).
// - active: at least one match exists and at least one is not yet completed.
// - completed: at least one match exists and every match is completed.
//
// We re-evaluate on every match insert (generateMatches /
// generatePlayoffs) and every match score (scoreMatch / saveMatchScore),
// so a tournament that gets a new round of matches added drops back to
// active automatically.
//
// The whole transition runs in one Postgres roundtrip via
// app_refresh_tournament_status — see migrations/0012_perf_rls_and_indexes.sql.

import 'server-only';
import type { createClient } from '@/lib/supabase/server';

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export async function refreshTournamentStatus(
  supabase: SupabaseClient,
  tournamentId: string,
): Promise<void> {
  await supabase.rpc('app_refresh_tournament_status', {
    p_tournament_id: tournamentId,
  });
}
