import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Exclude Next internals, static image assets, and the push service
    // worker (sw.js must be served directly — a redirect to /login would
    // break registration for logged-out cold-join players).
    '/((?!_next/static|_next/image|favicon.ico|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
