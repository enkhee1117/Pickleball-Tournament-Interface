'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isValidInviteCode, normalizeInviteCode } from '@/lib/invite-codes';
import { fieldString, formatPgError } from '@/lib/forms';
import { resolveIdentifier } from '@/lib/identifier';
import { validatePassword } from '@/lib/validation';
import { duprForSkill, normalizeGender } from '@/lib/quick-join';
import { createConfirmedAccount } from '@/lib/create-account';

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

// Cold-join quick account (cold-join.html steps 3-4, revised). Instead of an
// anonymous session, the 15-second profile now asks for a real email (or
// phone) + password up front — so the player has a durable login from tap
// one, their history follows them, and there's no risky anonymous→permanent
// upgrade path later. The account is auto-confirmed at creation (same policy
// as /signup) so nothing blocks them from playing right now; email
// verification only matters later when they want to organize their own event.
//
// If the identifier already has an account, we try the supplied password —
// a returning player can re-join any event straight from this form.
export async function joinMixerWithQuickAccount(formData: FormData): Promise<void> {
  const rawCode = String(formData.get('code') ?? '');
  const code = rawCode ? normalizeInviteCode(rawCode) : '';
  const tournamentId = fieldString(formData, 'tournament_id');
  const displayName = fieldString(formData, 'display_name').slice(0, 60);
  const dupr = duprForSkill(fieldString(formData, 'skill_level'));
  const gender = normalizeGender(fieldString(formData, 'gender'));
  const identifier = fieldString(formData, 'identifier');
  const password = String(formData.get('password') ?? '');

  if (!tournamentId) {
    redirect(code ? `/t/${encodeURIComponent(code)}?error=Tournament%20not%20found` : '/tournaments');
  }

  const back = code
    ? `/t/${encodeURIComponent(code)}`
    : `/tournaments/${tournamentId}/mixer`;
  const fail = (message: string): never =>
    redirect(`${back}?error=${encodeURIComponent(message)}`);

  if (!displayName) fail('Pick a display name to join');
  const resolved = resolveIdentifier(identifier);
  if (!resolved) fail('Enter a valid email or phone number.');
  const passCheck = validatePassword(password);
  if (!passCheck.ok) fail(passCheck.error);

  const supabase = await createClient();
  const account = await createConfirmedAccount({ resolved: resolved!, password, displayName });
  if (account.error) fail(account.error);
  // Existing account (`account.existed`): the supplied password must match —
  // then this is just a sign-in + join, which is exactly what a returning
  // player wants.

  const { error: signInErr } = await supabase.auth.signInWithPassword({
    email: resolved!.email,
    password,
  });
  if (signInErr) {
    fail(
      account.existed
        ? 'That email already has an account and the password didn’t match. Sign in instead.'
        : signInErr.message,
    );
  }

  const { error: bindError } = await supabase.rpc('app_mixer_join_with_profile', {
    p_tournament_id: tournamentId,
    p_display_name: displayName,
    p_dupr: dupr,
    p_gender: gender,
  });
  if (bindError) {
    redirect(`${back}?error=${encodeURIComponent(formatPgError(bindError))}`);
  }

  revalidatePath(`/tournaments/${tournamentId}/mixer`);
  redirect(`/tournaments/${tournamentId}/mixer`);
}
