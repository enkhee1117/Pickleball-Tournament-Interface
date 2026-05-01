import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Run on all paths except: static files, image optimization, favicon, the
    // legacy static app (still served from /public/legacy).
    '/((?!_next/static|_next/image|favicon.ico|legacy/.*|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
