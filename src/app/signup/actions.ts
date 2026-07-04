'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fieldString, type FormState } from '@/lib/forms';
import { validatePassword } from '@/lib/validation';
import { safeNext } from '@/lib/auth-redirect';
import { resolveIdentifier } from '@/lib/identifier';
import { normalizeGender } from '@/lib/quick-join';
import { createConfirmedAccount } from '@/lib/create-account';

// Signup accepts either a real email or a phone number; account creation
// policy (synth email for phones, auto-confirm) lives in lib/create-account.
export async function signUpWithPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const raw = fieldString(formData, 'phone') || fieldString(formData, 'identifier');
  const resolved = resolveIdentifier(raw);
  const password = String(formData.get('password') ?? '');
  const display_name = fieldString(formData, 'display_name');
  const gender = normalizeGender(fieldString(formData, 'gender'));
  const next = safeNext(fieldString(formData, 'next') || '/');

  if (!display_name || display_name.length < 1) {
    return { error: 'Display name is required.' };
  }
  if (!resolved) {
    return { error: 'Enter a valid phone or email address.' };
  }
  const passCheck = validatePassword(password);
  if (!passCheck.ok) return { error: passCheck.error };

  const account = await createConfirmedAccount({ resolved, password, displayName: display_name });
  if (account.existed) {
    const noun = resolved.kind === 'email' ? 'email' : 'phone';
    return { error: `An account with this ${noun} already exists. Try signing in instead.` };
  }
  if (account.error) {
    return { error: account.error };
  }
  if (!account.user) {
    return { error: 'Could not create the account. Try again in a moment.' };
  }

  // Optional gender lands on the profile (the handle_new_user trigger has
  // already created the row) so mixed / same-gender events can seat them.
  if (gender) {
    const admin = createAdminClient();
    const { error: genderErr } = await admin.from('profiles').update({ gender }).eq('id', account.user.id);
    // Non-fatal — the account works without it — but don't lose it silently.
    if (genderErr) console.error('[signup] failed to persist gender', genderErr.message);
  }

  const supabase = await createClient();
  const { error: signInErr } = await supabase.auth.signInWithPassword({
    email: resolved.email,
    password,
  });
  if (signInErr) {
    return { ok: 'Account created. Sign in below.' };
  }

  const target = next === '/' ? '/tournaments?welcome=1' : next;
  redirect(target);
}
