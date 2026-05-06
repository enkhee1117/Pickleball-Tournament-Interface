'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fieldString, type FormState } from '@/lib/forms';
import { validateEmail, validatePassword } from '@/lib/validation';
import { safeNext } from '@/lib/auth-redirect';

export async function signUpWithPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = fieldString(formData, 'email').toLowerCase();
  const password = String(formData.get('password') ?? '');
  const display_name = fieldString(formData, 'display_name');
  const next = safeNext(fieldString(formData, 'next') || '/');

  if (!display_name || display_name.length < 1) {
    return { error: 'Display name is required.' };
  }
  for (const c of [validateEmail(email), validatePassword(password)]) {
    if (!c.ok) return { error: c.error };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name } },
  });
  if (error) return { error: error.message };

  // Supabase returns a fake success when the email already exists (anti-
  // enumeration). The dead giveaway: data.user is set but its identities
  // array is empty. Surface a clear error instead of silently sending the
  // user back to the login page where their new password won't work.
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    return {
      error: 'An account with this email already exists. Try signing in instead.',
    };
  }

  // Dev-mode convenience: skip the email-confirmation round-trip. Auto-confirm
  // the new user via the service-role admin client, then sign them in so the
  // session cookie is set and the redirect lands them logged in.
  if (data.user && !data.session) {
    try {
      const admin = createAdminClient();
      await admin.auth.admin.updateUserById(data.user.id, { email_confirm: true });
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
      if (signInErr) {
        return {
          ok: 'Account created. Sign in below.',
          error: undefined,
        };
      }
    } catch (e) {
      console.error('auto-confirm failed', e);
      return {
        ok: 'Account created. If sign-in fails, check your email to confirm first.',
      };
    }
  }

  redirect(next);
}
