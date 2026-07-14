import { SurfaceLoading } from '@/components/desktop';

// Tournaments list skeleton. Rendered through SurfaceLoading so the shell stays
// in desktop mode during navigation — otherwise switching to this tab flashes
// the 480px mobile shell + TabBar before the desktop surface resolves.
export default function Loading() {
  return (
    <SurfaceLoading maxWidthClass="max-w-[1440px]">
      <div className="h-8 w-52 animate-pulse rounded-md bg-paper-2" />
      <div className="mb-4 mt-4 flex gap-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-8 w-16 animate-pulse rounded-full bg-paper-2" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-[18px] bg-white p-4"
            style={{ border: '1px solid var(--line)' }}
          >
            <div className="h-12 w-12 animate-pulse rounded-[14px] bg-paper-2" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-20 animate-pulse rounded bg-paper-2" />
              <div className="h-4 w-3/4 animate-pulse rounded bg-paper-2" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-paper-2" />
            </div>
          </div>
        ))}
      </div>
    </SurfaceLoading>
  );
}
