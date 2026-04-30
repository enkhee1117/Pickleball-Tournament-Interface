'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

function num(v: FormDataEntryValue | null): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function saveProfile(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const update = {
    display_name: String(formData.get('display_name') ?? '').trim() || null,
    full_name:    String(formData.get('full_name')    ?? '').trim() || null,
    gender:       (formData.get('gender') as string) || null,
    dupr_id:      String(formData.get('dupr_id')      ?? '').trim() || null,
    dupr_singles: num(formData.get('dupr_singles')),
    dupr_doubles: num(formData.get('dupr_doubles')),
    bio:          String(formData.get('bio')          ?? '').trim() || null,
  };

  const { error } = await supabase.from('profiles').update(update).eq('id', user.id);
  if (error) redirect(`/profile?error=${encodeURIComponent(error.message)}`);

  revalidatePath('/profile');
  redirect('/profile?saved=1');
}

export async function setAvatarUrl(url: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  await supabase.from('profiles').update({ avatar_url: url }).eq('id', user.id);
  revalidatePath('/profile');
}
