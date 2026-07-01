'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { THEME_COOKIE, isTheme, DEFAULT_THEME } from '@/lib/theme';

const ONE_YEAR = 60 * 60 * 24 * 365;

export async function setTheme(formData: FormData) {
  const raw = formData.get('theme');
  const value = typeof raw === 'string' && isTheme(raw) ? raw : DEFAULT_THEME;
  const store = await cookies();
  store.set(THEME_COOKIE, value, {
    path: '/',
    maxAge: ONE_YEAR,
    sameSite: 'lax',
  });
  revalidatePath('/', 'layout');
}
