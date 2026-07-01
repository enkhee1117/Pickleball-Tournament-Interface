export const THEME_COOKIE = 'tp_theme';

export const THEMES = ['sideline', 'night', 'arcade'] as const;
export type Theme = typeof THEMES[number];

export const DEFAULT_THEME: Theme = 'sideline';

export const THEME_LABELS: Record<Theme, string> = {
  sideline: 'Sideline',
  night: 'Night Match',
  arcade: 'Arcade',
};

export function isTheme(value: string | undefined): value is Theme {
  return !!value && (THEMES as readonly string[]).includes(value);
}

export function readThemeFromCookie(value: string | undefined): Theme {
  return isTheme(value) ? value : DEFAULT_THEME;
}
