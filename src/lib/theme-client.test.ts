import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { currentTheme, nextTheme, applyTheme, toggleTheme } from './theme-client';

// theme-client touches document.documentElement + document.cookie. The test env
// is 'node' (no DOM), so stub a minimal document with an attribute map and a
// cookie string that behave like the browser for the bits we use.
describe('theme-client', () => {
  let attrs: Record<string, string>;
  let cookieStore: { value: string };

  beforeEach(() => {
    attrs = { 'data-theme': 'sideline' };
    cookieStore = { value: '' };
    (globalThis as unknown as { document: unknown }).document = {
      documentElement: {
        getAttribute: (k: string) => attrs[k] ?? null,
        setAttribute: (k: string, v: string) => {
          attrs[k] = v;
        },
      },
    };
    Object.defineProperty(globalThis.document, 'cookie', {
      get: () => cookieStore.value,
      set: (v: string) => {
        cookieStore.value = v;
      },
      configurable: true,
    });
  });

  afterEach(() => {
    delete (globalThis as unknown as { document?: unknown }).document;
  });

  it('nextTheme cycles between the two themes', () => {
    expect(nextTheme('sideline')).toBe('night');
    expect(nextTheme('night')).toBe('sideline');
  });

  it('applyTheme flips data-theme and persists the cookie', () => {
    applyTheme('night');
    expect(attrs['data-theme']).toBe('night');
    expect(cookieStore.value).toContain('tp_theme=night');
    expect(cookieStore.value).toContain('path=/');
  });

  it('toggleTheme reads the live DOM theme so repeated toggles alternate (not stuck on a stale prop)', () => {
    expect(toggleTheme()).toBe('night');
    expect(attrs['data-theme']).toBe('night');
    expect(toggleTheme()).toBe('sideline');
    expect(attrs['data-theme']).toBe('sideline');
  });

  it('currentTheme falls back to the default for an unknown value', () => {
    attrs['data-theme'] = 'bogus';
    expect(currentTheme()).toBe('sideline');
  });
});
