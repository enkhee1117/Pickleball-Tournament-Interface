import { type EmailOtpType } from '@supabase/supabase-js';
import { type NextRequest } from 'next/server';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

// Magic link / invite / password-recovery confirmation handler.
// Uses redirect() from next/navigation so that auth cookies written by
// verifyOtp are flushed onto the redirect response — NextResponse.redirect
// drops those pending cookie mutations and the recovery session is lost.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = searchParams.get('next') ?? '/';

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) redirect(next);
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  redirect('/login?error=Invalid%20link');
}
