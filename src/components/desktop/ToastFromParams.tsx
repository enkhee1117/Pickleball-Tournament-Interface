'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useToast } from './ToastProvider';

/* Bridges the legacy ?ok= / ?error= redirect params onto the toast system
   (handoff: "use toasts instead of ?ok=/?error= URL params"). Server actions
   still redirect with those params; this fires the matching toast on arrival.
   Mounted once globally, inside <ToastProvider>. Wrapped in <Suspense> by the
   caller because useSearchParams requires it.

   The fire is deferred a tick and cancelled on cleanup — the StrictMode-safe
   "run once after mount" pattern (dev double-invokes the effect; only the
   surviving mount's timeout runs, so the toast fires exactly once).

   Note: we intentionally do NOT strip the params from the URL. Any Next-driven
   URL change (router.replace or the patched history.replaceState) re-renders the
   tree and drops the freshly-added toast. Leaving the param means a manual
   reload re-shows the toast — which is exactly what the old inline ?ok=/?error=
   banners did too, and normal in-app navigation drops the param on the next
   click. */
export function ToastFromParams() {
  const toast = useToast();
  const params = useSearchParams();
  const ok = params.get('ok');
  const error = params.get('error');

  useEffect(() => {
    if (!ok && !error) return;
    const t = setTimeout(() => {
      if (error) toast({ type: 'error', title: error, duration: 6000 });
      else if (ok) toast({ type: 'success', title: ok });
    }, 0);
    return () => clearTimeout(t);
  }, [ok, error, toast]);

  return null;
}
