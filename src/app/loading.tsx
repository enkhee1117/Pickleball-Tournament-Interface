// Home skeleton — the most-hit route was the only top-level page without
// one, so signed-in users stared at a blank shell while tournaments and
// live matches loaded. Mirrors the greeting → hero → live rail structure.
export default function Loading() {
  return (
    <div className="flex min-h-full flex-col bg-paper">
      <div className="flex items-center justify-between px-[18px] pt-3.5 pb-3">
        <div className="h-5 w-28 animate-pulse rounded-md bg-paper-2" />
        <div className="h-10 w-10 animate-pulse rounded-xl bg-paper-2" />
      </div>
      <div className="px-[18px] pb-24">
        <div className="mb-4 space-y-2 pt-2">
          <div className="h-8 w-3/4 animate-pulse rounded-md bg-paper-2" />
          <div className="h-8 w-1/2 animate-pulse rounded-md bg-paper-2" />
        </div>
        <div className="h-48 animate-pulse rounded-[22px] bg-paper-2" />
        <div className="mt-5 h-4 w-24 animate-pulse rounded bg-paper-2" />
        <div className="mt-3 space-y-2.5">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-[18px] bg-white"
              style={{ border: '1px solid var(--line)' }}
            />
          ))}
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2.5">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-[18px] bg-paper-2" />
          ))}
        </div>
      </div>
    </div>
  );
}
