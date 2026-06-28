'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isValidInviteCode, normalizeInviteCode } from '@/lib/invite-codes';

export async function joinPublicTournament(formData: FormData): Promise<void> {
  const code = normalizeInviteCode(String(formData.get('code') ?? ''));
  if (!isValidInviteCode(code)) {
    redirect(`/t/${encodeURIComponent(code)}?error=Invalid%20invite%20code`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('app_join_tournament_by_code', {
    p_code: code,
  });
  if (error || !data) {
    redirect(`/t/${encodeURIComponent(code)}?error=${encodeURIComponent(error?.message ?? 'Could not join tournament')}`);
  }

  const tournamentId = data as string;
  revalidatePath('/tournaments');
  revalidatePath(`/tournaments/${tournamentId}`);
  revalidatePath(`/tournaments/${tournamentId}/mixer`);
  redirect(`/tournaments/${tournamentId}/mixer`);
}
