import type { ReactNode } from 'react';

type Props = {
  title?: string;
  sub?: string;
  left?: ReactNode;
  right?: ReactNode;
  dark?: boolean;
};

export function TopBar({ title, sub, left, right, dark = false }: Props) {
  return (
    <div
      className="flex min-h-[52px] items-center gap-3 px-[18px] pt-[10px] pb-[14px]"
      style={{ color: dark ? 'var(--paper)' : 'var(--ink)' }}
    >
      <div className="flex w-10 justify-start">{left}</div>
      <div className="flex flex-1 flex-col items-center gap-0.5 text-center">
        {title && (
          <div className="text-[15px] font-semibold tracking-tight">{title}</div>
        )}
        {sub && (
          <div className="text-[11px] uppercase tracking-[0.04em]" style={{ color: dark ? 'oklch(0.78 0.02 100)' : 'var(--ink-3)' }}>
            {sub}
          </div>
        )}
      </div>
      <div className="flex w-10 justify-end">{right}</div>
    </div>
  );
}
