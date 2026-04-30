'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
}

// Invite-only: only allow magic-link sign-in for emails that
//   (a) already have an auth user, OR
//   (b) have an unaccepted, unexpired invite.
// We never send a magic link to a stranger.
export async function sendLoginLink(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const next = String(formData.get('next') ?? '/');

  if (!email) redirect('/login?error=Email%20required');

  const admin = createAdminClient();

  // Existing user? Page through up to 1000 — fine for invite-only leagues.
  let isExisting = false;
  for (let page = 1; page <= 5 && !isExisting; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (!data?.users?.length) break;
    isExisting = data.users.some((u) => u.email?.toLowerCase() === email);
  }

  let allowed = isExisting;
  if (!allowed) {
    const { data: invite } = await admin
      .from('invites')
      .select('id')
      .ilike('email', email)
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();
    allowed = !!invite;
  }

  if (!allowed) {
    redirect('/login?error=No%20invite%20for%20this%20email.%20Ask%20an%20admin.');
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${siteUrl()}/auth/confirm?next=${encodeURIComponent(next)}`,
      shouldCreateUser: true,
    },
  });

  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);
  redirect('/login?sent=1');
}
