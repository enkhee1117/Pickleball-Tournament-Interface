import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getSupabasePublicKey, getSupabaseUrl } from './env';

type CookieInput = { name: string; value: string; options?: CookieOptions };

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    getSupabaseUrl(),
    getSupabasePublicKey(),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(toSet: CookieInput[]) {
          try {
            for (const { name, value, options } of toSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // setAll throws when called from a Server Component; ignore — the
            // middleware refreshes the session on every request.
          }
        },
      },
    },
  );
}
