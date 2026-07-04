// Player-mixer skeleton — full-bleed so there is no paper flash or 480px
// letterboxing while the server component loads. Follows the user's theme
// (mixer-themed remaps --night-* to the live theme tokens).
export default function Loading() {
  const card = { background: 'var(--night-card)', border: '1px solid var(--night-line)' };
  return (
    <div data-fullscreen className="mixer-themed min-h-[100dvh]" style={{ background: 'var(--night-bg)' }}>
      <div className="mx-auto w-full max-w-[560px] px-[18px] pt-6 lg:max-w-[860px]">
        <div className="h-24 animate-pulse rounded-2xl" style={card} />
        <div className="mt-3 flex gap-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 w-28 animate-pulse rounded-xl" style={card} />
          ))}
        </div>
        <div className="mt-3 h-32 animate-pulse rounded-2xl" style={card} />
        {[1, 2, 3].map((i) => (
          <div key={i} className="mt-2.5 h-24 animate-pulse rounded-2xl" style={card} />
        ))}
      </div>
    </div>
  );
}
