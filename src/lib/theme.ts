export const THEME_COOKIE = 'tp_theme';

// Two themes only: Bright (paper-light "sideline") and Dark ("night").
// The ids stay 'sideline' / 'night' so existing cookies and the CSS token
// blocks keep working; the retired 'arcade' cookie value maps to dark.
export const THEMES = ['sideline', 'night'] as const;
export type Theme = typeof THEMES[number];

export const DEFAULT_THEME: Theme = 'sideline';

export const THEME_LABELS: Record<Theme, string> = {
  sideline: 'Bright',
  night: 'Dark',
};

export function isTheme(value: string | undefined): value is Theme {
  return !!value && (THEMES as readonly string[]).includes(value);
}

export function readThemeFromCookie(value: string | undefined): Theme {
  if (value === 'arcade') return 'night'; // legacy third theme
  return isTheme(value) ? value : DEFAULT_THEME;
}
