'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { AppRole } from '@/lib/types';

async function requireStaff() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!me || (me.role !== 'admin' && me.role !== 'organizer')) redirect('/');
  return { user, role: me.role as AppRole };
}

export async function createInvite(formData: FormData) {
  const { user, role: myRole } = await requireStaff();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const role = (String(formData.get('role') ?? 'player') as AppRole);

  if (!email) redirect('/admin?error=Email%20required');
  if (role === 'admin' && myRole !== 'admin') {
    redirect('/admin?error=Only%20admins%20may%20create%20admin%20invites');
  }

  const admin = createAdminClient();
  const { error } = await admin.from('invites').insert({
    email, role, invited_by: user.id,
  });
  if (error) redirect(`/admin?error=${encodeURIComponent(error.message)}`);

  revalidatePath('/admin');
  redirect('/admin?ok=Invite%20created');
}

export async function deleteInvite(formData: FormData) {
  const { role } = await requireStaff();
  if (role !== 'admin') redirect('/admin?error=Admins%20only');

  const id = String(formData.get('id') ?? '');
  const admin = createAdminClient();
  await admin.from('invites').delete().eq('id', id);
  revalidatePath('/admin');
  redirect('/admin?ok=Invite%20deleted');
}

export async function setRole(formData: FormData) {
  const { role } = await requireStaff();
  if (role !== 'admin') redirect('/admin?error=Admins%20only');

  const user_id = String(formData.get('user_id') ?? '');
  const next = String(formData.get('role') ?? 'player') as AppRole;
  if (!['admin', 'organizer', 'player'].includes(next)) {
    redirect('/admin?error=Bad%20role');
  }
  const admin = createAdminClient();
  const { error } = await admin.from('profiles').update({ role: next }).eq('id', user_id);
  if (error) redirect(`/admin?error=${encodeURIComponent(error.message)}`);
  revalidatePath('/admin');
  redirect('/admin?ok=Role%20updated');
}
