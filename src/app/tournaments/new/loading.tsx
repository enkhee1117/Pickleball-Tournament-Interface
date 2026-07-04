// New-tournament form skeleton — without this, entering /tournaments/new
// fell back to the tournaments *list* skeleton, which flashed the wrong shape.
export default function Loading() {
  return (
    <div className="flex min-h-full flex-col bg-paper">
      <div className="flex items-center gap-3 px-[18px] pt-[18px]">
        <div className="h-10 w-10 animate-pulse rounded-xl bg-paper-2" />
        <div className="h-6 w-40 animate-pulse rounded-md bg-paper-2" />
      </div>
      <div className="px-[18px] pb-24 pt-5">
        <div className="space-y-5">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-2">
              <div className="h-3 w-24 animate-pulse rounded bg-paper-2" />
              <div className="h-12 w-full animate-pulse rounded-[14px] bg-white" style={{ border: '1px solid var(--line)' }} />
            </div>
          ))}
          <div className="h-12 w-full animate-pulse rounded-[14px] bg-paper-2" />
        </div>
      </div>
    </div>
  );
}
