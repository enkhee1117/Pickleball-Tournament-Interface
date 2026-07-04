import 'server-only';
import webpush from 'web-push';
import { createAdminClient } from '@/lib/supabase/admin';

// Web-Push sender. Server-only — signs pushes with the VAPID key pair and
// fans them out to a user's registered browser endpoints. Requires the
// operator to provision keys (generate once with
// `npx web-push generate-vapid-keys`) via env:
//   VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY  — the key pair
//   VAPID_SUBJECT                         — a mailto: or https: contact
// When keys are absent this module degrades to a logged no-op so the rest of
// the mixer flow keeps working; nothing is faked, it simply does not send.

let configured: boolean | null = null;

function ensureConfigured(): boolean {
  if (configured !== null) return configured;
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim() || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim() || 'mailto:notify@trytodink.com';
  if (!publicKey || !privateKey) {
    configured = false;
    return false;
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

export function isPushConfigured(): boolean {
  return ensureConfigured();
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  // A renotify tag forces the OS to resurface a replaced notification — used
  // so the escalating chain can update in place without stacking.
  renotify?: boolean;
};

type SubscriptionRow = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

// Deliver one payload to every endpoint owned by the given users. Best-effort:
// per-endpoint failures are swallowed, and endpoints the push service reports
// as gone (404/410) are pruned so we stop trying them. Returns how many
// endpoints accepted the push.
export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<number> {
  const targets = Array.from(new Set(userIds.filter(Boolean)));
  if (targets.length === 0) return 0;
  if (!ensureConfigured()) {
    console.warn('[push] VAPID keys not configured — skipping send to', targets.length, 'user(s)');
    return 0;
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('push_subscriptions')
    .select('endpoint,p256dh,auth')
    .in('user_id', targets);
  if (error || !data || data.length === 0) return 0;

  const body = JSON.stringify(payload);
  const stale: string[] = [];
  let delivered = 0;

  await Promise.all(
    (data as SubscriptionRow[]).map(async (row) => {
      try {
        await webpush.sendNotification(
          { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
          body,
        );
        delivered += 1;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) stale.push(row.endpoint);
      }
    }),
  );

  if (stale.length > 0) {
    await admin.from('push_subscriptions').delete().in('endpoint', stale);
  }
  return delivered;
}
