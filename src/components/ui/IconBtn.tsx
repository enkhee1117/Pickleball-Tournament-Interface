'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Tone = 'ghost' | 'fill';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: Tone;
  children: ReactNode;
};

export function IconBtn({ tone = 'ghost', children, className = '', ...rest }: Props) {
  const fill = tone === 'fill';
  return (
    <button
      {...rest}
      className={`flex h-10 w-10 items-center justify-center rounded-xl transition active:scale-95 ${className}`}
      style={{
        background: fill ? 'var(--ink)' : 'transparent',
        color: fill ? 'var(--paper)' : 'var(--ink)',
      }}
    >
      {children}
    </button>
  );
}
