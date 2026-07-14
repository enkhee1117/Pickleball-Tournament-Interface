import { SurfaceLoading } from '@/components/desktop';

// Stats/history skeleton. SurfaceLoading keeps the desktop shell during the
// fetch so the tab switch doesn't flash the mobile shell + TabBar.
export default function Loading() {
  return (
    <SurfaceLoading maxWidthClass="max-w-[1080px]">
      <div className="h-8 w-2/3 max-w-[420px] animate-pulse rounded bg-paper-2" />
      <div className="mt-5 grid grid-cols-3 gap-2.5">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-2xl bg-white"
            style={{ border: '1px solid var(--line)' }}
          />
        ))}
      </div>
      <div className="mt-6 space-y-2.5">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-16 animate-pulse rounded-2xl bg-white"
            style={{ border: '1px solid var(--line)' }}
          />
        ))}
      </div>
    </SurfaceLoading>
  );
}
