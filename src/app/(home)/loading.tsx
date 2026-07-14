import { SurfaceLoading } from '@/components/desktop';

// Home ("Today") skeleton. Home renders as a desktop surface (logged-in cockpit
// or the marketing landing — both escape the 480px shell), so its loading state
// must too. Living inside the (home) route group keeps this desktop fallback
// from leaking onto the mobile-shell auth routes (login/signup/join), which
// still use the neutral src/app/loading.tsx.
export default function Loading() {
  return (
    <SurfaceLoading maxWidthClass="max-w-[1440px]">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="space-y-3">
          <div className="h-9 w-3/4 animate-pulse rounded-md bg-paper-2" />
          <div className="h-9 w-1/2 animate-pulse rounded-md bg-paper-2" />
          <div className="mt-2 h-4 w-40 animate-pulse rounded bg-paper-2" />
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-[18px] bg-paper-2" />
            ))}
          </div>
        </div>
        <div className="space-y-3">
          <div className="h-48 animate-pulse rounded-[22px] bg-paper-2" />
          <div className="mt-1 h-4 w-24 animate-pulse rounded bg-paper-2" />
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-[18px] bg-white"
              style={{ border: '1px solid var(--line)' }}
            />
          ))}
        </div>
      </div>
    </SurfaceLoading>
  );
}
