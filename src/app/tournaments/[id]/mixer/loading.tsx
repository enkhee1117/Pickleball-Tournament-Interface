// Player-mixer skeleton on the Night surface — full-bleed so there is no
// paper flash or 480px letterboxing while the server component loads.
export default function Loading() {
  const card = { background: 'oklch(0.215 0.03 264)', border: '1px solid oklch(0.36 0.04 266)' };
  return (
    <div data-fullscreen="night" className="min-h-[100dvh]" style={{ background: 'oklch(0.155 0.024 264)' }}>
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
