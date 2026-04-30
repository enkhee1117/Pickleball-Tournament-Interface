import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Profile } from '@/lib/types';

export async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return user;
}

export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  return (data as Profile | null) ?? null;
}

export async function requireProfile(): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) redirect('/login');
  return profile;
}

export async function requireRole(roles: Profile['role'][]) {
  const profile = await requireProfile();
  if (!roles.includes(profile.role)) redirect('/');
  return profile;
}
