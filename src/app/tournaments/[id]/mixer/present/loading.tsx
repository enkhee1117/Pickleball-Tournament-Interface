// Projector skeleton — fixed black, no shell flash on the big screen.
export default function Loading() {
  return (
    <div data-fullscreen="show" className="grid min-h-[100dvh] place-items-center" style={{ background: '#06070c' }}>
      <div className="mono animate-pulse text-[13px] uppercase tracking-[0.2em]" style={{ color: 'oklch(0.6 0.02 264)' }}>
        Warming up the board…
      </div>
    </div>
  );
}
