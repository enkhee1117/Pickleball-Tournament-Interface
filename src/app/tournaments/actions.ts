'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { generateRoundRobinDrafts, normalizeWhatsAppUrl } from '@/lib/tournaments';

export async function createTournament(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect('/tournaments?error=Please%20sign%20in%20to%20create%20a%20tournament');
  }

  const name = String(formData.get('name') ?? '').trim();
  const format = String(formData.get('format') ?? 'round_robin').trim() || 'round_robin';
  const whatsappRaw = String(formData.get('whatsapp_group_url') ?? '');
  const whatsapp_group_url = normalizeWhatsAppUrl(whatsappRaw);

  if (name.length < 3) {
    redirect('/tournaments?error=Tournament%20name%20must%20be%20at%20least%203%20characters');
  }
  if (whatsappRaw.trim() && !whatsapp_group_url) {
    redirect('/tournaments?error=WhatsApp%20link%20must%20be%20a%20valid%20chat.whatsapp.com%20URL');
  }

  const { error } = await supabase.from('tournaments').insert({
    owner_user_id: user.id,
    name,
    format,
    whatsapp_group_url,
  });

  if (error) {
    redirect(`/tournaments?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath('/tournaments');
  redirect('/tournaments?ok=Tournament%20created');
}

export async function updateTournamentWhatsApp(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/tournaments?error=Please%20sign%20in');

  const tournamentId = String(formData.get('tournament_id') ?? '');
  const raw = String(formData.get('whatsapp_group_url') ?? '');
  const whatsapp_group_url = normalizeWhatsAppUrl(raw);
  if (!tournamentId) redirect('/tournaments?error=Missing%20tournament%20id');
  if (raw.trim() && !whatsapp_group_url) {
    redirect(`/tournaments/${tournamentId}?error=Invalid%20WhatsApp%20group%20URL`);
  }

  const { error } = await supabase
    .from('tournaments')
    .update({ whatsapp_group_url })
    .eq('id', tournamentId);
  if (error) redirect(`/tournaments/${tournamentId}?error=${encodeURIComponent(error.message)}`);

  revalidatePath(`/tournaments/${tournamentId}`);
  revalidatePath('/tournaments');
  redirect(`/tournaments/${tournamentId}?ok=WhatsApp%20link%20saved`);
}

export async function addTournamentPlayer(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/tournaments?error=Please%20sign%20in');

  const tournamentId = String(formData.get('tournament_id') ?? '');
  const displayName = String(formData.get('display_name') ?? '').trim();
  if (!tournamentId || displayName.length < 2) {
    redirect(`/tournaments/${tournamentId}?error=Player%20name%20must%20be%20at%20least%202%20characters`);
  }

  const { error } = await supabase.from('tournament_players').insert({
    tournament_id: tournamentId,
    display_name: displayName,
  });
  if (error) redirect(`/tournaments/${tournamentId}?error=${encodeURIComponent(error.message)}`);

  revalidatePath(`/tournaments/${tournamentId}`);
  redirect(`/tournaments/${tournamentId}?ok=Player%20added`);
}

export async function generateRoundRobinMatches(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/tournaments?error=Please%20sign%20in');

  const tournamentId = String(formData.get('tournament_id') ?? '');
  if (!tournamentId) redirect('/tournaments?error=Missing%20tournament%20id');

  const { data: players, error: playersError } = await supabase
    .from('tournament_players')
    .select('display_name')
    .eq('tournament_id', tournamentId)
    .order('created_at', { ascending: true });
  if (playersError) redirect(`/tournaments/${tournamentId}?error=${encodeURIComponent(playersError.message)}`);
  if (!players || players.length < 2) {
    redirect(`/tournaments/${tournamentId}?error=Add%20at%20least%202%20players%20before%20generating%20matches`);
  }

  const drafts = generateRoundRobinDrafts(players.map((p) => p.display_name));

  const { error } = await supabase.from('matches').insert(
    drafts.map((p) => ({
      tournament_id: tournamentId,
      round_label: p.round_label,
      court_label: p.court_label,
      team_a_label: p.team_a_label,
      team_b_label: p.team_b_label,
      created_by_user_id: user.id,
    })),
  );
  if (error) redirect(`/tournaments/${tournamentId}?error=${encodeURIComponent(error.message)}`);

  revalidatePath(`/tournaments/${tournamentId}`);
  redirect(`/tournaments/${tournamentId}?ok=Matches%20generated`);
}
