import { CommandBar } from './CommandBar';

/* Wraps an organizer/projector surface so it escapes the 480px mobile shell
   (see the data-fullscreen rules in globals.css), hides the bottom TabBar,
   and provides the skip-link + #main target. variant tints the body so there
   is no paper letterboxing behind a dark surface.

   default → light Sideline surface (paper bg)
   ink     → body flips to --ink
   night   → body flips to the Night surface
   show    → body flips to the fixed projector black */
export function DesktopSurface({
  variant = 'default',
  className,
  children,
  withCommandBar = false,
}: {
  variant?: 'default' | 'ink' | 'night' | 'show';
  className?: string;
  children: React.ReactNode;
  withCommandBar?: boolean;
}) {
  return (
    <div data-fullscreen={variant === 'default' ? 'on' : variant} className={className}>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      {children}
      {withCommandBar ? <CommandBar /> : null}
    </div>
  );
}
