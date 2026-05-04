'use client';

import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';

type Tone = 'ink' | 'court' | 'ghost' | 'serve';

const TONES: Record<Tone, CSSProperties> = {
  ink: { background: 'var(--ink)', color: 'var(--paper)', border: 'none' },
  court: { background: 'var(--court)', color: 'oklch(0.2 0.04 140)', border: 'none' },
  ghost: { background: 'transparent', color: 'var(--ink)', border: '1.5px solid var(--line)' },
  serve: { background: 'var(--serve)', color: '#fff', border: 'none' },
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: Tone;
  children: ReactNode;
};

export function BigButton({ tone = 'ink', children, style, disabled, ...rest }: Props) {
  const elevated = tone === 'ink' || tone === 'court' || tone === 'serve';
  return (
    <button
      {...rest}
      disabled={disabled}
      className="w-full rounded-2xl px-5 py-[18px] text-base font-semibold leading-tight tracking-tight transition active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed"
      style={{
        ...TONES[tone],
        boxShadow: elevated ? '0 4px 14px oklch(0.2 0.05 100 / 0.12)' : 'none',
        ...style,
      }}
    >
      {children}
    </button>
  );
}
