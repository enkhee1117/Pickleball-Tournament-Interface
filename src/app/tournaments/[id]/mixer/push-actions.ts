'use server';

import { createClient } from '@/lib/supabase/server';

// Persist / drop a browser's Web-Push endpoint for the signed-in (or anonymous)
// player. Thin wrappers over the security-definer RPCs so the unique-endpoint
// upsert and ownership checks live in the database.

export async function savePushSubscription(
  endpoint: string,
  p256dh: string,
  auth: string,
  userAgent?: string,
): Promise<{ ok: boolean }> {
  if (!endpoint || !p256dh || !auth) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase.rpc('app_save_push_subscription', {
    p_endpoint: endpoint,
    p_p256dh: p256dh,
    p_auth: auth,
    p_user_agent: userAgent ?? null,
  });
  return { ok: !error };
}

export async function deletePushSubscription(endpoint: string): Promise<{ ok: boolean }> {
  if (!endpoint) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase.rpc('app_delete_push_subscription', {
    p_endpoint: endpoint,
  });
  return { ok: !error };
}
