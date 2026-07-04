'use client';

// Browser-side Web-Push plumbing: register the service worker and turn a
// granted Notification permission into a saved push subscription. Everything
// degrades quietly when the browser lacks support or VAPID isn't configured,
// so callers can fire-and-forget.

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();

function supported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!supported()) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js');
  } catch {
    return null;
  }
}

// Save (or refresh) the subscription for the current registration. Callable
// whenever permission is already granted — safe to run on every mount.
async function saveSubscription(registration: ServiceWorkerRegistration): Promise<boolean> {
  if (!VAPID_PUBLIC_KEY) return false;
  try {
    const existing = await registration.pushManager.getSubscription();
    const sub =
      existing ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      }));
    const json = sub.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false;
    const { savePushSubscription } = await import('@/app/tournaments/[id]/mixer/push-actions');
    await savePushSubscription(json.endpoint, json.keys.p256dh, json.keys.auth, navigator.userAgent);
    return true;
  } catch {
    return false;
  }
}

// Silent path: if the player already granted notifications, make sure their
// subscription is on file. Never prompts.
export async function ensureSubscribed(): Promise<void> {
  if (!supported() || !VAPID_PUBLIC_KEY) return;
  if (Notification.permission !== 'granted') return;
  const registration = (await registerServiceWorker()) ?? (await navigator.serviceWorker.ready);
  if (registration) await saveSubscription(registration);
}

// Gesture path: prompt for permission (if undecided) and subscribe. Returns
// true when we end up with a saved subscription. Call from a user gesture such
// as tapping "I'm here".
export async function enablePush(): Promise<boolean> {
  if (!supported() || !VAPID_PUBLIC_KEY) return false;
  let permission = Notification.permission;
  if (permission === 'default') {
    try {
      permission = await Notification.requestPermission();
    } catch {
      return false;
    }
  }
  if (permission !== 'granted') return false;
  const registration = (await registerServiceWorker()) ?? (await navigator.serviceWorker.ready);
  if (!registration) return false;
  return saveSubscription(registration);
}
