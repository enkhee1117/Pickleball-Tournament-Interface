/* Try to Dink service worker — Web-Push receiver for the player-notify chain.
 * Kept dependency-free and tiny. Its only jobs: show the "You're on Court N"
 * lock-screen push, and focus (or open) the mixer when the player taps it. */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_e) {
    data = { title: 'Try to Dink', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Try to Dink';
  const options = {
    body: data.body || '',
    tag: data.tag || 'trytodink',
    renotify: Boolean(data.renotify),
    icon: '/design-handoff/dink/idle.png',
    badge: '/design-handoff/dink/idle.png',
    data: { url: data.url || '/' },
    vibrate: [80, 40, 80],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        // Focus an existing tab and route it to the target if we can.
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client && target) {
            try {
              client.navigate(target);
            } catch (_e) {
              /* cross-origin or detached — fall through to openWindow */
            }
          }
          return undefined;
        }
      }
      return self.clients.openWindow ? self.clients.openWindow(target) : undefined;
    }),
  );
});
