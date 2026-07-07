'use client';

import { setTheme } from '@/app/theme-actions';
import { THEMES, type Theme } from '@/lib/theme';

/* Cycles Bright (Sideline) ⇄ Dark (Night) via the setTheme server action
   (cookie). The handoff's third "Arcade" theme is intentionally not shipped.
   Icon button matching the handoff nav's theme toggle. */
export function ThemeToggleButton({ theme }: { theme: Theme }) {
  const next = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
  return (
    <form action={setTheme}>
      <input type="hidden" name="theme" value={next} />
      <button
        type="submit"
        title="Switch theme"
        aria-label="Switch theme"
        className="grid h-10 w-10 place-items-center rounded-[11px] border"
        style={{ borderColor: 'var(--line)', background: 'var(--surface-card)', color: 'var(--text2)' }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M20 14.5A8 8 0 0 1 9.5 4 7 7 0 1 0 20 14.5z"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </form>
  );
}
