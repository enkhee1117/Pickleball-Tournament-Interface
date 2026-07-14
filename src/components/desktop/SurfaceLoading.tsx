/* Shared loading fallback for the desktop organizer/player surfaces.

   Why this exists: every top-level surface (Today, Tournaments, Stats, Me, the
   event cockpit…) renders a <DesktopSurface> whose data-fullscreen escapes the
   480px mobile shell (see globals.css) and hides the bottom TabBar. The
   route-segment loading.tsx that Next.js shows DURING navigation is a separate
   subtree — if it doesn't ALSO carry data-fullscreen, the shell snaps back to
   480px + the TabBar flickers in for the duration of the fetch, then jumps to
   full-width desktop when the page resolves. That is the "flashing between
   mobile and desktop" users see on every tab switch.

   Rendering the skeleton through this wrapper keeps the shell in desktop mode
   for the whole transition: same width, no TabBar flicker, a reserved 66px nav
   strip so content doesn't jump when the real DesktopNav mounts. */

const NAV_TINT: Record<string, { bar: string; block: string }> = {
  default: { bar: 'color-mix(in oklch, var(--bg) 86%, transparent)', block: 'var(--surface-raise)' },
  ink: { bar: 'color-mix(in oklch, var(--ink) 86%, transparent)', block: 'color-mix(in oklch, var(--paper) 12%, transparent)' },
  night: { bar: 'color-mix(in oklch, var(--night-bg) 86%, transparent)', block: 'color-mix(in oklch, var(--paper) 12%, transparent)' },
  show: { bar: 'transparent', block: 'color-mix(in oklch, var(--show-text) 10%, transparent)' },
};

export function SurfaceLoading({
  variant = 'default',
  maxWidthClass = 'max-w-[1120px]',
  liberty = true,
  children,
}: {
  variant?: 'default' | 'ink' | 'night' | 'show';
  /** Match the resolved page's <main> max-width so content doesn't reflow. */
  maxWidthClass?: string;
  liberty?: boolean;
  children?: React.ReactNode;
}) {
  const tint = NAV_TINT[variant] ?? NAV_TINT.default;
  return (
    <div data-fullscreen={variant === 'default' ? 'on' : variant} className="min-h-[100dvh]">
      {/* Nav placeholder — mirrors DesktopNav's 66px height + Liberty top rule so
          the header doesn't pop the content down when it mounts for real. */}
      <div
        className={`sticky top-0 z-40 flex h-[66px] items-center gap-3 px-4 sm:px-8${liberty ? ' liberty-bar' : ''}`}
        style={{ background: tint.bar, borderBottom: '1px solid var(--line)', backdropFilter: 'blur(12px)' }}
      >
        <div className="h-[30px] w-[30px] animate-pulse rounded-full" style={{ background: tint.block }} />
        <div className="h-5 w-28 animate-pulse rounded" style={{ background: tint.block }} />
        <div className="ml-auto flex items-center gap-[10px]">
          <div className="hidden h-10 w-40 animate-pulse rounded-[11px] sm:block" style={{ background: tint.block }} />
          <div className="h-10 w-10 animate-pulse rounded-full" style={{ background: tint.block }} />
        </div>
      </div>
      <main className={`mx-auto w-full ${maxWidthClass} px-4 pb-24 pt-7 sm:px-6 lg:px-8`}>{children}</main>
    </div>
  );
}
