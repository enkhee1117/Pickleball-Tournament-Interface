// Public share-link skeleton. Cold visitors hit this route from a text
// message on mobile — the dark hero + tab strip shape shows instantly while
// the tournament payload loads.
export default function Loading() {
  return (
    <div className="flex min-h-full flex-col bg-paper">
      <div className="px-[18px] pb-[18px] pt-3" style={{ background: 'var(--ink)' }}>
        <div className="flex h-12 items-center">
          <div className="h-10 w-10 animate-pulse rounded-xl" style={{ background: 'oklch(0.28 0.02 100)' }} />
        </div>
        <div className="h-6 w-16 animate-pulse rounded-full" style={{ background: 'oklch(0.28 0.02 100)' }} />
        <div className="mt-2.5 h-8 w-2/3 animate-pulse rounded-md" style={{ background: 'oklch(0.28 0.02 100)' }} />
        <div className="mt-2 h-3.5 w-1/2 animate-pulse rounded" style={{ background: 'oklch(0.28 0.02 100)' }} />
        <div className="mt-4 h-11 animate-pulse rounded-xl" style={{ background: 'oklch(0.24 0.02 100)' }} />
      </div>
      <div className="space-y-2.5 px-[18px] pt-4">
        <div className="h-12 animate-pulse rounded-2xl bg-paper-2" />
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-28 animate-pulse rounded-2xl bg-white"
            style={{ border: '1px solid var(--line)' }}
          />
        ))}
      </div>
    </div>
  );
}
