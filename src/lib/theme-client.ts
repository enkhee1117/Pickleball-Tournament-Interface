// Client-side theme application. Toggling the theme used to submit a server
// action that called revalidatePath('/', 'layout') — re-rendering AND
// re-fetching every server component in the tree just to flip a cookie, so the
// new theme only painted after a full data round-trip. Instead we flip
// data-theme on <html> (the CSS token blocks are keyed on it, so it switches
// instantly) and write the cookie straight from the browser, so the next
// server render is already correct. No round-trip, no refetch.
import { THEME_COOKIE, THEMES, DEFAULT_THEME, isTheme, type Theme } from './theme';

const ONE_YEAR = 60 * 60 * 24 * 365;

// The live theme, read from the DOM rather than a (possibly stale) server prop
// so repeated toggles between renders don't no-op.
export function currentTheme(): Theme {
  if (typeof document === 'undefined') return DEFAULT_THEME;
  const v = document.documentElement.getAttribute('data-theme') ?? undefined;
  return isTheme(v) ? v : DEFAULT_THEME;
}

export function nextTheme(theme: Theme): Theme {
  return THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
}

export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', theme);
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
}

// Flip to the next theme and return it. Optimistic: paints immediately.
export function toggleTheme(): Theme {
  const next = nextTheme(currentTheme());
  applyTheme(next);
  return next;
}
