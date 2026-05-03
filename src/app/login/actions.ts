'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { fieldString, type FormState } from '@/lib/forms';
import { validateEmail, validatePassword } from '@/lib/validation';

function safeNext(raw: string): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw;
}

export async function signInWithPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = fieldString(formData, 'email').toLowerCase();
  const password = String(formData.get('password') ?? '');
  const next = safeNext(fieldString(formData, 'next') || '/');

  for (const c of [validateEmail(email), validatePassword(password)]) {
    if (!c.ok) return { error: c.error };
  }

  const supabase = await createClient();
  const { data: authData, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.message.toLowerCase().includes('invalid')) {
      return { error: 'Email and password did not match.' };
    }
    return { error: error.message };
  }

  // When there's no specific destination, drop the organizer on their most
  // recent tournament so they land in context rather than the home page.
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
