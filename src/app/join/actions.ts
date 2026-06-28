'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { formatPgError } from '@/lib/forms';
import { isValidInviteCode, normalizeInviteCode } from '@/lib/invite-codes';

export type JoinResult =
  | { tournamentId: string; format: string | null; error?: undefined }
  | { tournamentId?: undefined; error: string };

export async function joinByInviteCode(rawCode: string): Promise<JoinResult> {
  const code = normalizeInviteCode(rawCode);
  if (!isValidInviteCode(code)) {
    return { error: 'Invite codes are 6 letters or numbers — double-check the code.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'Please sign in to join a tournament.' };
  }

  const { data, error } = await supabase.rpc('app_join_tournament_by_code', {
    p_code: code,
  });
  if (error || !data) {
    return { error: error ? formatPgError(error) : 'No tournament found for that code.' };
  }

  const tournamentId = data as string;
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('format')
    .eq('id', tournamentId)
    .maybeSingle();
  revalidatePath('/tournaments');
  revalidatePath(`/tournaments/${tournamentId}`);
  revalidatePath(`/tournaments/${tournamentId}/mixer`);
  return { tournamentId, format: (tournament as { format?: string } | null)?.format ?? null };
}
