import type { CSSProperties, ReactNode } from 'react';

type Tone = 'default' | 'live' | 'court' | 'ghost' | 'dark';
type Size = 'sm' | 'md';

const TONE_STYLES: Record<Tone, CSSProperties> = {
  default: { background: 'var(--paper-2)', color: 'var(--ink-2)', border: '1px solid var(--line)' },
  live: { background: 'var(--serve)', color: '#fff', border: '1px solid transparent' },
  court: { background: 'var(--court)', color: 'oklch(0.2 0.04 140)', border: '1px solid transparent' },
  ghost: { background: 'transparent', color: 'var(--ink-2)', border: '1px solid var(--line)' },
  dark: { background: 'var(--ink)', color: 'var(--paper)', border: '1px solid transparent' },
};

export function Chip({
  children,
  tone = 'default',
  size = 'sm',
}: {
  children: ReactNode;
  tone?: Tone;
  size?: Size;
}) {
  const padding = size === 'sm' ? '4px 9px' : '6px 12px';
  const fontSize = size === 'sm' ? 11 : 12;
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-semibold uppercase tracking-wider"
      style={{ ...TONE_STYLES[tone], padding, fontSize, letterSpacing: '0.02em' }}
    >
      {tone === 'live' && (
        <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-white" />
      )}
      {children}
    </span>
  );
}
