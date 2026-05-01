'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

function safeNext(raw: string): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw;
}

export async function signUpWithPassword(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');
  const display_name = String(formData.get('display_name') ?? '').trim();
  const next = safeNext(String(formData.get('next') ?? '/'));

  if (!email || !password || !display_name) {
    redirect(`/signup?error=${encodeURIComponent('All fields are required')}`);
  }
  if (password.length < 8) {
    redirect(`/signup?error=${encodeURIComponent('Password must be at least 8 characters')}`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name } },
  });

  if (error) {
    redirect(`/signup?error=${encodeURIComponent(error.message)}`);
  }

  // If email confirmation is required, no session is returned. Send the user
  // to login with a confirmation message; otherwise they are already signed in.
  if (!data.session) {
    redirect(
      `/login?ok=${encodeURIComponent('Account created. Check your email to confirm, then sign in.')}`,
    );
  }

  redirect(next);
}
