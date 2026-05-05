'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export async function dismissSelfLink(formData: FormData): Promise<void> {
  const tournamentId = String(formData.get('tournament_id') ?? '').trim();
  if (!tournamentId) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.rpc('app_dismiss_tournament_self_link', {
    p_tournament_id: tournamentId,
  });

  revalidatePath('/history');
}
