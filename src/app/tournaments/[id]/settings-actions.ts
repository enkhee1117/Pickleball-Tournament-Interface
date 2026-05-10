'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { formatPgError } from '@/lib/forms';

export async function resetTournamentMatches(formData: FormData): Promise<void> {
  const tournamentId = String(formData.get('tournament_id') ?? '').trim();
  if (!tournamentId) redirect('/tournaments');

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Defense-in-depth: the RPC enforces manager-only via
  // app_require_tournament_manager, but checking here too means a future
  // RPC regression doesn't silently leak destructive access.
  const [{ data: tour }, { data: member }] = await Promise.all([
    supabase
      .from('tournaments')
      .select('owner_user_id')
      .eq('id', tournamentId)
      .maybeSingle(),
    supabase
      .from('tournament_members')
      .select('role')
      .eq('tournament_id', tournamentId)
      .eq('user_id', user.id)
      .maybeSingle(),
  ]);
  const isOwner = tour?.owner_user_id === user.id;
  const isManager =
    isOwner || member?.role === 'organizer' || member?.role === 'admin';
  if (!isManager) {
    redirect(`/tournaments/${tournamentId}?error=Only%20organizers%20can%20do%20that`);
  }

  const { data, error } = await supabase.rpc('app_reset_tournament_matches', {
    p_tournament_id: tournamentId,
  });
  if (error) {
    redirect(
      `/tournaments/${tournamentId}?tab=settings&error=${encodeURIComponent(formatPgError(error))}`,
    );
  }

  revalidatePath(`/tournaments/${tournamentId}`);
  revalidatePath(`/tournaments/${tournamentId}/invite`);
  revalidatePath('/tournaments');
  redirect(
    `/tournaments/${tournamentId}/invite?ok=${encodeURIComponent(`Cleared ${data ?? 0} matches`)}`,
  );
}

export async function deleteTournament(formData: FormData): Promise<void> {
  const tournamentId = String(formData.get('tournament_id') ?? '').trim();
  if (!tournamentId) redirect('/tournaments');

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Defense-in-depth: the RPC checks owner_user_id but verifying here too
  // means a non-owner clicking a crafted form gets a clean redirect rather
  // than relying entirely on the RPC's permission error.
  const { data: tour } = await supabase
    .from('tournaments')
    .select('owner_user_id')
    .eq('id', tournamentId)
    .maybeSingle();
  if (!tour || tour.owner_user_id !== user.id) {
    redirect(`/tournaments/${tournamentId}?error=Only%20the%20owner%20can%20delete%20the%20tournament`);
  }

  const { error } = await supabase.rpc('app_delete_tournament', {
    p_tournament_id: tournamentId,
  });
  if (error) {
    redirect(
      `/tournaments/${tournamentId}?tab=settings&error=${encodeURIComponent(formatPgError(error))}`,
    );
  }

  revalidatePath('/tournaments');
  revalidatePath('/');
  revalidatePath('/history');
  redirect(`/tournaments?ok=${encodeURIComponent('Tournament deleted')}`);
}

// Cover image setter — takes a public URL (already uploaded to storage by
// the client) and stores it on the tournament. Returns ok/error so the
// upload component can surface failures inline.
export async function setTournamentCoverImage(
  tournamentId: string,
  url: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!tournamentId) return { ok: false, error: 'Missing tournament id.' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sign in to manage the tournament.' };

  const { error } = await supabase.rpc('app_set_tournament_cover', {
    p_tournament_id: tournamentId,
    p_url: url,
  });
  if (error) return { ok: false, error: formatPgError(error) };

  revalidatePath(`/tournaments/${tournamentId}`);
  revalidatePath(`/tournaments/${tournamentId}/invite`);
  revalidatePath('/tournaments');
  return { ok: true };
}
