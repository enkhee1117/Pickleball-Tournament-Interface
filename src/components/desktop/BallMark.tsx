/* Round pickleball logo from the handoff chrome.js LOGO: dark ball with a
   lime equator stripe (var(--accent)) and holes. Adapts via currentColor,
   so set the wrapper's color for the ball body. */
export function BallMark({ size = 30 }: { size?: number }) {
  const id = `ballmark-${size}`;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <defs>
        <clipPath id={id}>
          <circle cx="16" cy="16" r="13" />
        </clipPath>
      </defs>
      <circle cx="16" cy="16" r="13" fill="currentColor" />
      <g clipPath={`url(#${id})`}>
        <rect x="0" y="13.7" width="32" height="4.6" fill="var(--accent)" />
        <g fill="#000" opacity="0.5">
          <circle cx="11" cy="9" r="1.5" />
          <circle cx="20.5" cy="8.6" r="1.5" />
          <circle cx="15.8" cy="11.4" r="1.4" />
          <circle cx="24" cy="12" r="1.4" />
          <circle cx="8" cy="12.6" r="1.4" />
          <circle cx="8.6" cy="22" r="1.5" />
          <circle cx="16.4" cy="23" r="1.5" />
        </g>
      </g>
    </svg>
  );
}
