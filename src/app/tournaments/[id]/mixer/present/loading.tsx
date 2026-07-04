// Projector skeleton — fixed black, no shell flash on the big screen.
export default function Loading() {
  return (
    <div data-fullscreen="show" className="grid min-h-[100dvh] place-items-center" style={{ background: 'var(--show-bg)' }}>
      <div className="mono animate-pulse text-[13px] uppercase tracking-[0.2em]" style={{ color: 'var(--show-text-dim)' }}>
        Warming up the board…
      </div>
    </div>
  );
}
