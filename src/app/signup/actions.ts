'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
}

export async function acceptInvite(formData: FormData) {
  const token = String(formData.get('token') ?? '');
  const display_name = String(formData.get('display_name') ?? '').trim();

  if (!token || !display_name) {
    redirect(`/signup?token=${token}&error=Display%20name%20required`);
  }

  const admin = createAdminClient();
  const { data: invite } = await admin
    .from('invites')
    .select('email, expires_at, accepted_at')
    .eq('token', token)
    .maybeSingle();

  if (!invite || invite.accepted_at || new Date(invite.expires_at) < new Date()) {
    redirect(`/signup?token=${token}&error=Invite%20invalid`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: invite.email,
    options: {
      emailRedirectTo: `${siteUrl()}/auth/confirm?next=/profile`,
      shouldCreateUser: true,
      data: { display_name },
    },
  });

  if (error) redirect(`/signup?token=${token}&error=${encodeURIComponent(error.message)}`);
  redirect('/login?sent=1');
}
