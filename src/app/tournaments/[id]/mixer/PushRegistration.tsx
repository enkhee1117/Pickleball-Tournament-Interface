'use client';

import { useEffect } from 'react';
import { ensureSubscribed, registerServiceWorker } from '@/lib/push/client';

// Mounted on the player mixer surface. Registers the service worker and, if the
// player already granted notifications, refreshes their push subscription on
// file. Never prompts — the permission prompt is deferred to the "I'm here"
// gesture (see MixerCourtCall) so the ask lands in-context, during the event.
export function PushRegistration() {
  useEffect(() => {
    registerServiceWorker().then(() => ensureSubscribed());
  }, []);
  return null;
}
