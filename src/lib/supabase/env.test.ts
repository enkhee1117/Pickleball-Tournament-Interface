import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSupabasePublicKey, getSupabaseUrl } from './env';

describe('Supabase env helpers', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reads the project URL', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');

    expect(getSupabaseUrl()).toBe('https://example.supabase.co');
  });

  it('prefers the legacy anon key when both public key names exist', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'legacy-anon');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'publishable');

    expect(getSupabasePublicKey()).toBe('legacy-anon');
  });

  it('falls back to the newer publishable key name', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'publishable');

    expect(getSupabasePublicKey()).toBe('publishable');
  });

  it('throws a useful error when the public key is missing', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', '');

    expect(() => getSupabasePublicKey()).toThrow(
      'Missing NEXT_PUBLIC_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    );
  });
});
