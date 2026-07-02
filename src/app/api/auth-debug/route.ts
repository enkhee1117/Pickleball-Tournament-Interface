import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// TEMPORARY password-reset diagnostic. Gated behind AUTH_DEBUG_TOKEN — if that
// env var is unset the route 404s, so it's inert until you deliberately enable
// it. REMOVE THIS FILE (and the env var) once the email issue is resolved.
//
// Usage:
//   1. Set AUTH_DEBUG_TOKEN=<some-long-random-string> on Vercel, redeploy.
//   2. GET /api/auth-debug?token=<that>&email=you@example.com
//
// It uses admin.generateLink({ type: 'recovery' }), which builds a real
// password-recovery link WITHOUT sending any email. That isolates the failure:
//   - userExists=false        → no account under that email (that's the bug).
//   - generateLinkError set    → the token/redirect config is wrong.
//   - userExists=true, no err  → account + token system are FINE; the only
//                                remaining failure is SMTP delivery (Resend).
// When it succeeds it also returns a live recoveryLink you can paste into the
// browser to reset the password right now, bypassing email entirely.
export async function GET(request: NextRequest) {
  const expected = process.env.AUTH_DEBUG_TOKEN;
  const { searchParams } = new URL(request.url);
  if (!expected || searchParams.get('token') !== expected) {
    return new NextResponse('Not found', { status: 404 });
  }

  const email = (searchParams.get('email') ?? '').toLowerCase().trim();
  if (!email) {
    return NextResponse.json({ error: 'pass ?email=' }, { status: 400 });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ?? 'https://trytodink.com';
  const redirectTo = `${siteUrl}/auth/confirm?next=/reset-password`;

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo },
  });

  // With &send=1, actually invoke resetPasswordForEmail — the real send path —
  // and report its synchronous result. If Supabase's SMTP handoff fails
  // synchronously (auth failure, connection refused, sender rejected with a
  // 5xx), the error appears here. If it returns ok but no email arrives, the
  // rejection is async inside Resend → check the Resend "Emails" tab.
  let sendResult: { attempted: boolean; ok?: boolean; error?: unknown } = { attempted: false };
  if (searchParams.get('send') === '1') {
    const { createClient } = await import('@/lib/supabase/server');
    const supabase = await createClient();
    const { error: sendErr } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    sendResult = sendErr
      ? { attempted: true, ok: false, error: { message: sendErr.message, code: sendErr.code ?? null, status: sendErr.status ?? null } }
      : { attempted: true, ok: true };
  }

  return NextResponse.json({
    email,
    siteUrlEnvSet: !!process.env.NEXT_PUBLIC_SITE_URL,
    resolvedRedirectTo: redirectTo,
    userExists: !error,
    generateLinkError: error
      ? { message: error.message, code: error.code ?? null, status: error.status ?? null }
      : null,
    // Present only with &send=1: the result of the real email-send call.
    sendResult,
    // Only present when the account exists — a live, one-time recovery link.
    // Paste it into the browser to reset the password without any email.
    recoveryLink: data?.properties?.action_link ?? null,
  });
}
