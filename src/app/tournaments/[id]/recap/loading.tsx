// Recap skeleton — recap renders on the paper DesktopSurface, so it needs its
// own fallback instead of inheriting the dark tournament-detail skeleton.
// data-fullscreen keeps it out of the 480px mobile shell during navigation, or
// the max-w container below gets clamped to 480px and jumps on resolve.
export default function Loading() {
  return (
    <div data-fullscreen="on" className="min-h-[100dvh] bg-paper">
      <div className="mx-auto max-w-[1440px] px-8 pb-16 pt-6">
        <div className="h-56 animate-pulse rounded-[22px] bg-white" style={{ border: '1px solid var(--line)' }} />
        <div className="mt-6 grid gap-3 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-40 animate-pulse rounded-[18px] bg-white"
              style={{ border: '1px solid var(--line)' }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
