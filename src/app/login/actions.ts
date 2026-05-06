'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { fieldString, type FormState } from '@/lib/forms';
import { validatePassword } from '@/lib/validation';
import { safeNext } from '@/lib/auth-redirect';
import { normalizeE164 } from '@/lib/phone';

// Phone-only login. Email login was retired — every account uses E.164
// phone + password.
export async function signInWithPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const phoneRaw = fieldString(formData, 'phone');
  const phone = normalizeE164(phoneRaw);
  const password = String(formData.get('password') ?? '');
  const next = safeNext(fieldString(formData, 'next') || '/');

  if (!phone) {
    return { error: 'Enter your phone in E.164 format (e.g. +15551234567).' };
  }
  const passCheck = validatePassword(password);
  if (!passCheck.ok) return { error: passCheck.error };

  const supabase = await createClient();
  const { data: authData, error } = await supabase.auth.signInWithPassword({ phone, password });
  if (error) {
    if (error.message.toLowerCase().includes('invalid')) {
      return { error: 'Phone and password did not match.' };
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
