import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Profile } from '@/lib/types';

export type CurrentUser = { id: string; email: string | null };

// Read the signed-in user for Server Components / read paths.
//
// Previously every page called supabase.auth.getUser(), which makes a network
// round-trip to the Auth server to validate the JWT. Middleware
// (src/lib/supabase/middleware.ts) already does exactly that on every matched
// request, so pages were paying for a SECOND auth round-trip on every
// navigation — a major reason transitions felt like full reloads rather than
// instant SPA changes.
//
// getClaims() instead verifies the JWT locally against the project's JWKS
// (cached process-wide across requests with a TTL) when asymmetric JWT signing
// keys are enabled, so there's no per-navigation network call. With legacy
// symmetric JWT secrets it transparently falls back to getUser(), so this is
// never slower than before, and the token is authenticated either way.
//
// React's `cache()` dedupes this to a single call per request, so layout +
// page + child components share one read. Server Actions that mutate data
// still call supabase.auth.getUser() directly for defence in depth.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  return {
    id: claims.sub,
    email: typeof claims.email === 'string' ? claims.email : null,
  };
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}

export const getProfile = cache(async (): Promise<Profile | null> => {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  return (data as Profile | null) ?? null;
});

export async function requireProfile(): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) redirect('/login');
  return profile;
}

export async function requireRole(roles: Profile['role'][]) {
  const profile = await requireProfile();
  if (!roles.includes(profile.role)) redirect('/');
  return profile;
}
