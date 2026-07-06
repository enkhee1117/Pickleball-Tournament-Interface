'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { fieldString, type FormState } from '@/lib/forms';
import { validatePassword } from '@/lib/validation';
import { safeNext } from '@/lib/auth-redirect';
import { resolveEmailIdentifier } from '@/lib/identifier';

// Auth is email-only. The form field is still named `phone` for back-compat
// with existing password managers, but the value must be a real email.
export async function signInWithPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const raw = fieldString(formData, 'phone') || fieldString(formData, 'identifier');
  const resolved = resolveEmailIdentifier(raw);
  const password = String(formData.get('password') ?? '');
  const next = safeNext(fieldString(formData, 'next') || '/');

  if (!resolved) {
    return { error: 'Enter a valid email address.' };
  }
  const passCheck = validatePassword(password);
  if (!passCheck.ok) return { error: passCheck.error };

  const supabase = await createClient();
  // Clear any pre-existing local session before authenticating. Without this,
  // a leftover auth cookie from a previous user on the same browser (e.g. a
  // stale or chunked `sb-*-auth-token`) can shadow the fresh login on a later
  // read, so the app resolves the wrong profile — the signed-in name/events
  // flip back to the previous user. `scope: 'local'` only clears this browser's
  // cookies (no network round-trip, no effect on other devices).
  await supabase.auth.signOut({ scope: 'local' });
  const { data: authData, error } = await supabase.auth.signInWithPassword({
    email: resolved.email,
    password,
  });
  if (error) {
    if (error.message.toLowerCase().includes('invalid')) {
      return { error: 'That email and password did not match.' };
    }
    return { error: error.message };
  }

  if (next === '/' && authData.user) {
    const { data: member } = await supabase
      .from('tournament_members')
      .select('tournament_id')
      .eq('user_id', authData.user.id)
      .in('role', ['owner', 'organizer'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (member) redirect(`/tournaments/${member.tournament_id}`);
    redirect('/tournaments');
  }

  redirect(next);
}
