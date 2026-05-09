'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { formatPgError } from '@/lib/forms';
import { isValidInviteCode, normalizeInviteCode } from '@/lib/invite-codes';

// Personal invite confirmation — fired from the "Yes, that's me" button on
// /t/<code>/p/<player_id>. Verifies the player belongs to the tournament
// addressed by the invite code (so a hand-edited URL can't claim someone
// from a different tournament), then runs the standard claim RPC and
// drops the user onto the scoreboard.
export async function claimViaPersonalInvite(formData: FormData): Promise<void> {
  const code = normalizeInviteCode(String(formData.get('code') ?? ''));
  const playerId = String(formData.get('player_id') ?? '').trim();
  if (!isValidInviteCode(code) || !playerId) {
    redirect('/');
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/signup?next=${encodeURIComponent(`/t/${code.toLowerCase()}/p/${playerId}`)}`);
  }

  // Look up tournament_id off the invite code so we can both validate the
  // player belongs to it AND know where to send the user afterwards.
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('id')
    .eq('invite_code', code)
    .maybeSingle();
  const tournamentId = (tournament as { id: string } | null)?.id;
  if (!tournamentId) redirect('/');

  // Pull the user's display name so the claim RPC has something to renamed
  // the row to. Same shape as the existing claimInvitePlayer flow.
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .single();
  const profileName = (profile?.display_name ?? '').trim();
  if (profileName.length < 2) {
    redirect(`/profile?next=${encodeURIComponent(`/t/${code.toLowerCase()}/p/${playerId}`)}`);
  }

  const { error } = await supabase.rpc('app_claim_tournament_player_with_name', {
    p_player_id: playerId,
    p_display_name: profileName,
  });
  if (error) {
    const msg = encodeURIComponent(formatPgError(error));
    redirect(`/t/${code.toLowerCase()}?error=${msg}`);
  }

  revalidatePath(`/tournaments/${tournamentId}`);
  revalidatePath(`/t/${code.toLowerCase()}`);
  revalidatePath('/history');
  redirect(`/tournaments/${tournamentId}?ok=Welcome%20to%20the%20tournament`);
}
