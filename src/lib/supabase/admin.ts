import { createClient } from '@supabase/supabase-js';

// Service-role client. ONLY use from server actions / route handlers.
// Bypasses RLS — never import this from client components.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase service-role env vars');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
