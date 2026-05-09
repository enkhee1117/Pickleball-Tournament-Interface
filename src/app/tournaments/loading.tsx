export default function Loading() {
  return (
    <div className="flex min-h-full flex-col bg-paper">
      <div className="flex items-center justify-between px-[18px] pt-[18px]">
        <div className="h-6 w-44 animate-pulse rounded-md bg-paper-2" />
        <div className="h-10 w-10 animate-pulse rounded-xl bg-paper-2" />
      </div>
      <div className="px-[18px] pb-24 pt-3">
        <div className="mb-3.5 flex gap-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-7 w-16 animate-pulse rounded-full bg-paper-2" />
          ))}
        </div>
        <div className="space-y-2.5">
          {[1, 2, 3, 4].map((i) => (
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
      </div>
    </div>
  );
}
