import { cookies } from 'next/headers';
import { THEME_COOKIE, readThemeFromCookie } from '@/lib/theme';
import { ThemeSwitcherClient } from './ThemeSwitcherClient';

// Server wrapper: reads the active theme from the cookie for the initial paint,
// then hands off to the client picker which applies changes optimistically.
export async function ThemeSwitcher() {
  const store = await cookies();
  const active = readThemeFromCookie(store.get(THEME_COOKIE)?.value);
  return <ThemeSwitcherClient initial={active} />;
}
