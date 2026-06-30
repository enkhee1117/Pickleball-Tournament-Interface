'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isValidInviteCode, normalizeInviteCode } from '@/lib/invite-codes';
import { fieldString, formatPgError } from '@/lib/forms';

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

// Anonymous mixer join — combines sign-in and roster bind in one server-side
// step so the two halves succeed or fail together. Replaces the prior client
// component that round-tripped twice and hardcoded "Guest player" as the
// display name. Error redirects use the public /t/[code] landing when an
// invite code is present, otherwise the mixer page itself (covers users who
// landed on /tournaments/[id]/mixer directly without going through QR/code).
export async function joinMixerAsAnonymous(formData: FormData): Promise<void> {
  const rawCode = String(formData.get('code') ?? '');
  const code = rawCode ? normalizeInviteCode(rawCode) : '';
  const tournamentId = fieldString(formData, 'tournament_id');
  const displayName = fieldString(formData, 'display_name').slice(0, 60);

  if (!tournamentId) {
    redirect(code ? `/t/${encodeURIComponent(code)}?error=Tournament%20not%20found` : '/tournaments');
  }

  const back = code
    ? `/t/${encodeURIComponent(code)}`
    : `/tournaments/${tournamentId}/mixer`;
  if (!displayName) {
    redirect(`${back}?error=${encodeURIComponent('Pick a display name to join')}`);
  }

  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInAnonymously();
  if (signInError) {
    redirect(`${back}?error=${encodeURIComponent(signInError.message)}`);
  }

  const { error: bindError } = await supabase.rpc('app_mixer_bind_roster_entry', {
    p_tournament_id: tournamentId,
    p_display_name: displayName,
  });
  if (bindError) {
    redirect(`${back}?error=${encodeURIComponent(formatPgError(bindError))}`);
  }

  revalidatePath(`/tournaments/${tournamentId}/mixer`);
  redirect(`/tournaments/${tournamentId}/mixer`);
}
