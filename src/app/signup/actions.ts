'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fieldString, type FormState } from '@/lib/forms';
import { validatePassword } from '@/lib/validation';
import { safeNext } from '@/lib/auth-redirect';
import { normalizeE164 } from '@/lib/phone';

// Phone-only signup. Routed through the service-role admin client because
// the public auth.signUp endpoint refuses phone payloads when the project's
// "Phone provider" toggle is off — we don't need SMS verification at all,
// just the row in auth.users + a session, so we go direct.
export async function signUpWithPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const phoneRaw = fieldString(formData, 'phone');
  const phone = normalizeE164(phoneRaw);
  const password = String(formData.get('password') ?? '');
  const display_name = fieldString(formData, 'display_name');
  const next = safeNext(fieldString(formData, 'next') || '/');

  if (!display_name || display_name.length < 1) {
    return { error: 'Display name is required.' };
  }
  if (!phone) {
    return { error: 'Phone must be in E.164 format (e.g. +15551234567).' };
  }
  const passCheck = validatePassword(password);
  if (!passCheck.ok) return { error: passCheck.error };

  const admin = createAdminClient();
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    phone,
    password,
    phone_confirm: true,
    user_metadata: { display_name },
  });
  if (createErr) {
    const msg = createErr.message?.toLowerCase() ?? '';
    if (msg.includes('already') || msg.includes('exists') || msg.includes('registered')) {
      return { error: 'An account with this phone already exists. Try signing in instead.' };
    }
    return { error: createErr.message };
  }
  if (!created.user) {
    return { error: 'Could not create the account. Try again in a moment.' };
  }

  // Sign the new user in so the cookie is set on the redirect.
  const supabase = await createClient();
  const { error: signInErr } = await supabase.auth.signInWithPassword({ phone, password });
  if (signInErr) {
    return { ok: 'Account created. Sign in below.' };
  }

  // Land them somewhere that visibly proves they're signed in. The
  // default-empty-tournaments page now shows a welcome banner via the
  // ?welcome=1 query param.
  const target = next === '/' ? '/tournaments?welcome=1' : next;
  redirect(target);
}
