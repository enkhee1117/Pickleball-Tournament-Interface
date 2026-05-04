'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { formatPgError } from '@/lib/forms';
import { validateTournamentFormat, validateTournamentName } from '@/lib/validation';

type CreateInput = {
  name: string;
  format: string;
  playerCount?: number;
};

type CreateResult = { id: string; error?: undefined } | { id?: undefined; error: string };

export async function createTournamentClient(input: CreateInput): Promise<CreateResult> {
  for (const c of [validateTournamentName(input.name), validateTournamentFormat(input.format)]) {
    if (!c.ok) return { error: c.error };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'Please sign in to create a tournament.' };
  }

  const { data: newId, error } = await supabase.rpc('app_create_tournament', {
    p_name: input.name,
    p_format: input.format,
    p_whatsapp_group_url: null,
    p_player_count: input.playerCount ?? 0,
  });

  if (error || !newId) {
    return { error: error ? formatPgError(error) : 'Could not create tournament.' };
  }

  revalidatePath('/tournaments');
  return { id: newId as string };
}
