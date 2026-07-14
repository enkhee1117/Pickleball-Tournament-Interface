import { SurfaceLoading } from '@/components/desktop';

// Event hub skeleton. SurfaceLoading keeps the desktop shell (no mobile/TabBar
// flash) while the event data loads; the dark block mirrors the TournamentHero.
export default function Loading() {
  return (
    <SurfaceLoading maxWidthClass="max-w-[1440px]">
      <div
        className="relative overflow-hidden rounded-[22px] px-6 pb-6 pt-6"
        style={{ background: 'var(--ink)', color: 'var(--paper)' }}
      >
        <div className="flex items-center justify-between">
          <div className="h-8 w-40 animate-pulse rounded-full" style={{ background: 'oklch(0.24 0.02 100)' }} />
          <div className="hidden gap-2 sm:flex">
            <div className="h-9 w-20 animate-pulse rounded-xl" style={{ background: 'oklch(0.24 0.02 100)' }} />
            <div className="h-9 w-28 animate-pulse rounded-xl" style={{ background: 'oklch(0.24 0.02 100)' }} />
          </div>
        </div>
        <div className="pt-4">
          <div className="h-5 w-32 animate-pulse rounded-full" style={{ background: 'oklch(0.24 0.02 100)' }} />
          <div className="mt-3 h-10 w-3/4 max-w-[520px] animate-pulse rounded" style={{ background: 'oklch(0.24 0.02 100)' }} />
          <div className="mt-3 h-3 w-1/3 max-w-[320px] animate-pulse rounded" style={{ background: 'oklch(0.24 0.02 100)' }} />
        </div>
      </div>
      <div className="mt-4 flex gap-1 rounded-xl p-1" style={{ background: 'var(--paper-2)' }}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-9 flex-1 animate-pulse rounded-[9px] bg-white" />
        ))}
      </div>
      <div className="mt-4 space-y-2.5">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-2xl bg-white p-4" style={{ border: '1px solid var(--line)' }}>
            <div className="h-3 w-20 animate-pulse rounded bg-paper-2" />
            <div className="mt-3 flex items-center gap-3">
              <div className="h-7 w-7 animate-pulse rounded-full bg-paper-2" />
              <div className="h-4 flex-1 animate-pulse rounded bg-paper-2" />
              <div className="h-5 w-8 animate-pulse rounded bg-paper-2" />
            </div>
            <div className="mt-2 flex items-center gap-3">
              <div className="h-7 w-7 animate-pulse rounded-full bg-paper-2" />
              <div className="h-4 flex-1 animate-pulse rounded bg-paper-2" />
              <div className="h-5 w-8 animate-pulse rounded bg-paper-2" />
            </div>
          </div>
        ))}
      </div>
    </SurfaceLoading>
  );
}
