import { SurfaceLoading } from '@/components/desktop';

// Profile/Me skeleton. SurfaceLoading keeps the desktop shell during the fetch
// so switching to this tab doesn't flash the mobile shell + TabBar.
export default function Loading() {
  return (
    <SurfaceLoading maxWidthClass="max-w-[1120px]">
      <div className="mx-auto w-full max-w-[520px]">
        <div className="flex flex-col items-center pb-4 pt-1">
          <div className="h-[110px] w-[110px] animate-pulse rounded-full bg-paper-2" />
          <div className="mt-3 h-7 w-40 animate-pulse rounded bg-paper-2" />
          <div className="mt-2 h-3 w-56 animate-pulse rounded bg-paper-2" />
        </div>
        <div className="h-32 animate-pulse rounded-[18px] bg-paper-2" />
        <div className="mt-5 space-y-px overflow-hidden rounded-2xl bg-white" style={{ border: '1px solid var(--line)' }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-12 animate-pulse bg-paper-2" />
          ))}
        </div>
      </div>
    </SurfaceLoading>
  );
}
