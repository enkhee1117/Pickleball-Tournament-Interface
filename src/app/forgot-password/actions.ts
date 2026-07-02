'use server';

import { createClient } from '@/lib/supabase/server';
import { fieldString, type FormState } from '@/lib/forms';
import { validateEmail } from '@/lib/validation';

// Resolve the public site URL for the reset link. Prefer the explicit env
// var; fall back to the production domain rather than localhost so a missing
// Vercel env var doesn't silently mint reset links that point at a dev host
// (which Supabase then rejects if localhost isn't in the redirect allow-list).
function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '');
  if (explicit) return explicit;
  return 'https://trytodink.com';
}

export async function sendPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = fieldString(formData, 'email').toLowerCase();
  const c = validateEmail(email);
  if (!c.ok) return { error: c.error };

  const redirectTo = `${siteUrl()}/auth/confirm?next=/reset-password`;
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });

  if (error) {
    // High-signal server log so the real cause is findable in the Vercel
    // invocation logs (redirect-not-allowed, rate limit, SMTP failure, …).
    // The route-level error-rate metric stays 0% because we intentionally
    // return a generic success to the client (anti-enumeration), so this
    // log line is the only server-side breadcrumb.
    console.error(
      `[forgot-password] resetPasswordForEmail failed — redirectTo=${redirectTo} code=${error.code ?? 'n/a'} status=${error.status ?? 'n/a'} message=${error.message}`,
    );
    // In non-production (preview/local) surface the real reason to the UI so
    // the founder can diagnose without digging through logs. Production keeps
    // the generic message to avoid leaking whether an account exists.
    if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production') {
      return { error: `[diagnostic] ${error.message}` };
    }
  } else {
    console.info(`[forgot-password] reset requested ok — redirectTo=${redirectTo}`);
  }

  // Always show the same message, regardless of whether the address exists.
  return { ok: 'If an account exists for that email, a reset link is on its way.' };
}
