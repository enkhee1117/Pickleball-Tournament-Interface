import { type NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export async function middleware(request: NextRequest) {
  // Temporary public mode: disable auth enforcement in middleware.
  return NextResponse.next({ request });
}

export const config = {
  matcher: [
    // Run on all paths except: static files, image optimization, favicon, the
    // legacy static app (still served from /public/legacy).
    '/((?!_next/static|_next/image|favicon.ico|legacy/.*|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
