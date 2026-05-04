import type { ReactNode } from 'react';

type Props = {
  title: string;
  action?: ReactNode;
  mute?: string;
};

export function SectionHeader({ title, action, mute }: Props) {
  return (
    <div className="flex items-baseline justify-between px-[18px] pt-2 pb-2.5">
      <div>
        <div className="text-[18px] font-semibold tracking-tight text-ink">{title}</div>
        {mute && <div className="mt-0.5 text-xs text-ink-3">{mute}</div>}
      </div>
      {action && (
        <div className="text-[13px] font-semibold" style={{ color: 'var(--court-deep)' }}>
          {action}
        </div>
      )}
    </div>
  );
}
