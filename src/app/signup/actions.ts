'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fieldString, type FormState } from '@/lib/forms';
import { validatePassword } from '@/lib/validation';
import { safeNext } from '@/lib/auth-redirect';
import { resolveIdentifier } from '@/lib/identifier';
import { normalizeGender } from '@/lib/quick-join';

// Signup accepts either a real email or a phone number.
//   - Email path: the account is created with the user's real email so
//     password reset / future magic links reach an actual inbox.
//   - Phone path: paired with a synthetic email (`<digits>@phone.local`)
//     so signInWithPassword can route through the email provider — this
//     sidesteps the project's "Phone provider" toggle.
// Either way we auto-confirm the address so signup is one step (no click
// through a verification email) — the mixer usage pattern is "guests show
// up and want to play in under a minute."
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

  const admin = createAdminClient();
  const createPayload = resolved.kind === 'phone'
    ? {
        phone: resolved.phone,
        email: resolved.email, // synth email so signInWithPassword works
        password,
        phone_confirm: true,
        email_confirm: true,
        user_metadata: { display_name },
      }
    : {
        email: resolved.email,
        password,
        email_confirm: true,
        user_metadata: { display_name },
      };
  const { data: created, error: createErr } = await admin.auth.admin.createUser(createPayload);
  if (createErr) {
    const msg = createErr.message?.toLowerCase() ?? '';
    if (msg.includes('already') || msg.includes('exists') || msg.includes('registered')) {
      const noun = resolved.kind === 'email' ? 'email' : 'phone';
      return { error: `An account with this ${noun} already exists. Try signing in instead.` };
    }
    return { error: createErr.message };
  }
  if (!created.user) {
    return { error: 'Could not create the account. Try again in a moment.' };
  }

  // Optional gender lands on the profile (the handle_new_user trigger has
  // already created the row) so mixed / same-gender events can seat them.
  if (gender) {
    await admin.from('profiles').update({ gender }).eq('id', created.user.id);
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
