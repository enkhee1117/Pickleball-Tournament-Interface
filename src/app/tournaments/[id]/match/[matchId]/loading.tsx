// Match score-entry skeleton — two score panels + keypad shape.
export default function Loading() {
  return (
    <div className="flex min-h-full flex-col bg-paper px-[18px] pt-4">
      <div className="flex items-center justify-between">
        <div className="h-10 w-10 animate-pulse rounded-xl bg-paper-2" />
        <div className="h-4 w-32 animate-pulse rounded bg-paper-2" />
        <div className="h-10 w-10 animate-pulse rounded-xl bg-paper-2" />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {[1, 2].map((i) => (
          <div key={i} className="h-44 animate-pulse rounded-[22px] bg-paper-2" />
        ))}
      </div>
      <div className="mt-4 grid grid-cols-4 gap-2">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-xl bg-paper-2" />
        ))}
      </div>
    </div>
  );
}
