export default function Loading() {
  return (
    <div className="flex min-h-full flex-col bg-paper">
      <div
        className="relative overflow-hidden px-[18px] pb-[18px] pt-[18px]"
        style={{ background: 'var(--ink)', color: 'var(--paper)' }}
      >
        <div className="flex items-center justify-between">
          <div className="h-10 w-10 animate-pulse rounded-xl" style={{ background: 'oklch(0.24 0.02 100)' }} />
          <div className="h-10 w-20 animate-pulse rounded-xl" style={{ background: 'oklch(0.24 0.02 100)' }} />
        </div>
        <div className="pl-1 pt-3">
          <div className="h-5 w-32 animate-pulse rounded-full" style={{ background: 'oklch(0.24 0.02 100)' }} />
          <div className="mt-2 h-8 w-3/4 animate-pulse rounded" style={{ background: 'oklch(0.24 0.02 100)' }} />
          <div className="mt-2 h-3 w-1/3 animate-pulse rounded" style={{ background: 'oklch(0.24 0.02 100)' }} />
        </div>
        <div
          className="mt-4 flex gap-1 rounded-xl p-1"
          style={{ background: 'oklch(0.24 0.02 100)' }}
        >
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-8 flex-1 animate-pulse rounded-[9px]" style={{ background: 'oklch(0.3 0.02 100)' }} />
          ))}
        </div>
      </div>
      <div className="flex-1 px-[18px] pt-4">
        <div className="space-y-2.5">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-2xl bg-white p-4"
              style={{ border: '1px solid var(--line)' }}
            >
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
      </div>
    </div>
  );
}
