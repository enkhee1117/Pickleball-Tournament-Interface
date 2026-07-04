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

// cold-join.html step 3 — a rough skill band captured in the 15-second quick
// profile. Mapped to a representative DUPR so teammates see a level and the
// draw has a rating to work with. Kept coarse on purpose; the player can
// refine it later from their profile.
const SKILL_TO_DUPR: Record<string, number> = {
  new: 2.75,
  mid: 3.25, // 3.0–3.5
  high: 4.25, // 4.0+
};

// Anonymous mixer join — combines sign-in and the quick-profile bind in one
// server-side step so the two halves succeed or fail together. Persists name +
// skill onto the anonymous session (roster entry AND profiles row) via
// app_mixer_join_with_profile, so the 15-second profile survives an in-place
// account upgrade. Error redirects use the public /t/[code] landing when an
// invite code is present, otherwise the mixer page itself (covers users who
// landed on /tournaments/[id]/mixer directly without going through QR/code).
export async function joinMixerAsAnonymous(formData: FormData): Promise<void> {
  const rawCode = String(formData.get('code') ?? '');
  const code = rawCode ? normalizeInviteCode(rawCode) : '';
  const tournamentId = fieldString(formData, 'tournament_id');
  const displayName = fieldString(formData, 'display_name').slice(0, 60);
  const skill = fieldString(formData, 'skill_level');
  const dupr = skill in SKILL_TO_DUPR ? SKILL_TO_DUPR[skill] : null;

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

  const { error: bindError } = await supabase.rpc('app_mixer_join_with_profile', {
    p_tournament_id: tournamentId,
    p_display_name: displayName,
    p_dupr: dupr,
  });
  if (bindError) {
    redirect(`${back}?error=${encodeURIComponent(formatPgError(bindError))}`);
  }

  revalidatePath(`/tournaments/${tournamentId}/mixer`);
  redirect(`/tournaments/${tournamentId}/mixer`);
}
