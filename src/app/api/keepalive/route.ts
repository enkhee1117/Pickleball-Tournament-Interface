import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Keepalive endpoint hit by a scheduled Vercel Cron (see vercel.json "crons")
// so the Supabase project — currently on the Free plan — doesn't auto-pause
// after ~7 days of no database activity. It runs one trivial query to register
// activity and returns no data.
//
// Auth: optional. If CRON_SECRET is set (Vercel automatically sends it as a
// Bearer token on cron invocations), we require it so the endpoint can't be
// spammed; without it the route still works out of the box.
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createAdminClient();
    // A minimal query — the point is to touch Postgres, not read data.
    const { error } = await supabase.from('tournaments').select('id').limit(1);
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, at: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
