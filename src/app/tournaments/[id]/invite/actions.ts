'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { formatPgError } from '@/lib/forms';
import { normalizeWhatsAppUrl } from '@/lib/validation';

// Thin wrappers around the RPC actions in @/app/tournaments/actions so the
// new invite UI can call them with a simple void/redirect interface instead
// of the FormState pattern used by useActionState elsewhere.

export async function addInvitePlayer(formData: FormData): Promise<void> {
  const tournamentId = String(formData.get('tournament_id') ?? '').trim();
  const displayName = String(formData.get('display_name') ?? '').trim();
  if (!tournamentId || displayName.length < 2) {
    redirect(`/tournaments/${tournamentId}/invite?error=Player%20name%20must%20be%20at%20least%202%20characters`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { error } = await supabase.rpc('app_add_tournament_player', {
    p_tournament_id: tournamentId,
    p_display_name: displayName,
    p_email: null,
  });
  if (error) {
    redirect(`/tournaments/${tournamentId}/invite?error=${encodeURIComponent(formatPgError(error))}`);
  }

  revalidatePath(`/tournaments/${tournamentId}`);
  revalidatePath(`/tournaments/${tournamentId}/invite`);
  redirect(`/tournaments/${tournamentId}/invite?ok=Player%20added`);
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

  // app_update_tournament expects a name too; fetch the current name to keep it.
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
