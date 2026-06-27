import { createClient } from '@supabase/supabase-js';
import { getSupabaseUrl } from './env';

// Service-role client. ONLY use from server actions / route handlers.
// Bypasses RLS — never import this from client components.
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
  return createClient(getSupabaseUrl(), key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
