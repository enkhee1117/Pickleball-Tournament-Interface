'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { fieldString, type FormState } from '@/lib/forms';
import { validatePassword } from '@/lib/validation';
import { safeNext } from '@/lib/auth-redirect';
import { resolveIdentifier } from '@/lib/identifier';

// Accepts either a real email or a phone number as the login identifier.
// Phone-shaped inputs get routed through the synth-email trick
// (`<digits>@phone.local`) so we don't depend on the project's "Phone signins"
// toggle being flipped on in the dashboard; real emails pass through as-is
// so password resets and future magic links reach the actual inbox.
export async function signInWithPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  // The form field is still called `phone` for URL back-compat with existing
  // password managers; the value we accept is broader.
  const raw = fieldString(formData, 'phone') || fieldString(formData, 'identifier');
  const resolved = resolveIdentifier(raw);
  const password = String(formData.get('password') ?? '');
  const next = safeNext(fieldString(formData, 'next') || '/');

  if (!resolved) {
    return { error: 'Enter a valid phone or email address.' };
  }
  const passCheck = validatePassword(password);
  if (!passCheck.ok) return { error: passCheck.error };

  const supabase = await createClient();
  const { data: authData, error } = await supabase.auth.signInWithPassword({
    email: resolved.email,
    password,
  });
  if (error) {
    if (error.message.toLowerCase().includes('invalid')) {
      return { error: 'That phone/email and password did not match.' };
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
