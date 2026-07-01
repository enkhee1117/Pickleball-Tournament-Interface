import { cookies } from 'next/headers';
import { setTheme } from '@/app/theme-actions';
import { THEMES, THEME_LABELS, THEME_COOKIE, readThemeFromCookie } from '@/lib/theme';

export async function ThemeSwitcher() {
  const store = await cookies();
  const active = readThemeFromCookie(store.get(THEME_COOKIE)?.value);

  return (
    <div
      className="overflow-hidden rounded-2xl bg-white"
      style={{ border: '1px solid var(--line)' }}
    >
      <div className="px-4 pt-3 text-[11px] uppercase tracking-[0.06em] text-ink-3">
        Theme
      </div>
      <div className="grid grid-cols-3 gap-2 px-3 pb-3 pt-2">
        {THEMES.map((theme) => {
          const on = theme === active;
          return (
            <form key={theme} action={setTheme} className="contents">
              <input type="hidden" name="theme" value={theme} />
              <button
                type="submit"
                aria-pressed={on}
                className="flex flex-col items-center gap-1.5 rounded-xl px-2 py-2 text-[12px] font-semibold transition"
                style={{
                  background: on ? 'var(--ink)' : 'var(--paper-2)',
                  color: on ? 'var(--paper)' : 'var(--ink)',
                  border: `1px solid ${on ? 'var(--ink)' : 'var(--line)'}`,
                }}
              >
                <span aria-hidden style={{ display: 'flex', gap: 3 }}>
                  <span style={{ ...swatch, background: swatchPaper(theme) }} />
                  <span style={{ ...swatch, background: swatchInk(theme) }} />
                  <span style={{ ...swatch, background: 'var(--court)' }} />
                </span>
                <span>{THEME_LABELS[theme]}</span>
              </button>
            </form>
          );
        })}
      </div>
    </div>
  );
}

const swatch: React.CSSProperties = {
  width: 12,
  height: 12,
  borderRadius: 4,
  border: '1px solid rgba(0,0,0,0.08)',
};

function swatchPaper(t: string): string {
  if (t === 'night') return 'oklch(0.155 0.024 264)';
  if (t === 'arcade') return 'oklch(0.96 0.022 320)';
  return 'oklch(0.97 0.008 95)';
}

function swatchInk(t: string): string {
  if (t === 'night') return 'oklch(0.96 0.008 95)';
  if (t === 'arcade') return 'oklch(0.22 0.06 320)';
  return 'oklch(0.18 0.01 80)';
}
