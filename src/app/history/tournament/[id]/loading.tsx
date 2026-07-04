// Past-tournament detail skeleton.
export default function Loading() {
  return (
    <div className="flex min-h-full flex-col bg-paper">
      <div className="flex items-center gap-3 px-[18px] pt-[18px]">
        <div className="h-10 w-10 animate-pulse rounded-xl bg-paper-2" />
        <div className="h-5 w-40 animate-pulse rounded bg-paper-2" />
      </div>
      <div className="space-y-2.5 px-[18px] pb-24 pt-4">
        <div className="h-36 animate-pulse rounded-[22px] bg-paper-2" />
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-2xl bg-white"
            style={{ border: '1px solid var(--line)' }}
          />
        ))}
      </div>
    </div>
  );
}
