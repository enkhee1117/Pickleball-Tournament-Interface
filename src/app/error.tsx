'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { TopBar } from '@/components/ui/TopBar';
import { Icons } from '@/components/ui/icons';

// Global error boundary. Catches anything that throws in a server component
// or client tree and gives the user a recover-and-keep-going pair of
// actions instead of Next's default white-on-red stack-trace page.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log so the rare prod bug shows up in the browser console for triage.
    if (process.env.NODE_ENV !== 'production') {
      console.error(error);
    }
  }, [error]);

  return (
    // data-fullscreen keeps the error state in the desktop shell. Without it a
    // throwing DesktopSurface page would drop back into the 480px mobile shell
    // (and flash the bottom TabBar in) mid-error — the same shell-mismatch the
    // loading fallbacks were fixed for.
    <div data-fullscreen="on" className="flex min-h-[100dvh] flex-col bg-paper">
      <TopBar title="Something went wrong" />
      <div className="mx-auto w-full max-w-[520px] flex-1 px-[18px] pt-2">
        <div
          className="rounded-2xl p-5 text-center"
          style={{ background: 'var(--card)', border: '1px solid var(--line)' }}
        >
          <div className="text-[28px]">⚠️</div>
          <div className="mt-2 text-[15px] font-semibold text-ink">
            We hit an unexpected error.
          </div>
          <div className="mt-1 text-xs text-ink-3">
            Try the action again — most of the time a refresh sorts it. If it
            keeps happening, tell us what you were doing.
          </div>
          {error.digest && (
            <div className="mono mt-2 text-[10px] text-ink-3">
              ref {error.digest}
            </div>
          )}
          <div className="mt-4 grid gap-2">
            <button
              type="button"
              onClick={reset}
              className="rounded-xl px-5 py-2.5 text-[13px] font-semibold"
              style={{ background: 'var(--ink)', color: 'var(--paper)' }}
            >
              Try again
            </button>
            <Link
              href="/"
              className="rounded-xl px-5 py-2.5 text-[13px] font-semibold"
              style={{ color: 'var(--ink-2)', border: '1px solid var(--line)', background: 'var(--surface-card)' }}
            >
              Back to home {Icons.arrow}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
