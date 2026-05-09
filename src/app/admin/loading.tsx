export default function Loading() {
  return (
    <div className="flex min-h-full flex-col bg-paper">
      <div className="flex items-center justify-between px-[18px] pt-[18px]">
        <div className="h-10 w-10 animate-pulse rounded-xl bg-paper-2" />
        <div className="h-6 w-20 animate-pulse rounded bg-paper-2" />
        <div className="h-10 w-10" />
      </div>
      <div className="flex-1 px-[18px] pb-24 pt-3">
        <div className="h-32 animate-pulse rounded-2xl bg-white" style={{ border: '1px solid var(--line)' }} />
        <div className="mt-4 space-y-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-2xl bg-white"
              style={{ border: '1px solid var(--line)' }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
