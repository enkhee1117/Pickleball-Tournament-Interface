// Invite-page skeleton — its own segment renders on the paper DesktopSurface,
// so the dark tournament-detail skeleton above it was the wrong surface.
// data-fullscreen keeps it out of the 480px mobile shell during navigation, or
// the max-w container below gets clamped to 480px and jumps on resolve.
export default function Loading() {
  return (
    <div data-fullscreen="on" className="min-h-[100dvh] bg-paper">
      <div className="mx-auto w-full max-w-[1140px] px-4 pb-24 pt-6 sm:px-6 lg:px-8">
        <div className="mb-4 h-4 w-64 animate-pulse rounded bg-paper-2" />
        <div className="h-8 w-52 animate-pulse rounded-md bg-paper-2" />
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-[18px] bg-white"
              style={{ border: '1px solid var(--line)' }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
