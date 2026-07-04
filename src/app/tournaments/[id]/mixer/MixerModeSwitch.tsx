import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icons } from '@/components/ui/icons';

type MixerMode = 'event' | 'player' | 'organizer' | 'present';

export function MixerModeSwitch({ tournamentId, active, dark = true }: { tournamentId: string; active: MixerMode; dark?: boolean }) {
  const items: Array<{ id: MixerMode; label: string; aria: string; href: string; icon: ReactNode }> = [
    { id: 'event', label: 'Event', aria: 'Event overview', href: `/tournaments/${tournamentId}`, icon: Icons.trophy },
    { id: 'player', label: 'Player', aria: 'Player view', href: `/tournaments/${tournamentId}/mixer`, icon: Icons.contacts },
    { id: 'organizer', label: 'Run', aria: 'Organizer controls', href: `/tournaments/${tournamentId}/mixer/admin`, icon: Icons.bars },
    { id: 'present', label: 'Screen', aria: 'Presentation screen', href: `/tournaments/${tournamentId}/mixer/present`, icon: Icons.eye },
  ];
  return (
    <nav
      aria-label="Mixer view switcher"
      className="mx-[18px] mb-3 rounded-2xl p-1"
      style={{
        background: dark ? 'var(--night-card)' : 'var(--paper-2)',
        border: dark ? '1px solid var(--night-line)' : '1px solid var(--line)',
      }}
    >
      <div className="grid grid-cols-4 gap-1">
        {items.map((item) => {
          const on = active === item.id;
          return (
            <Link
              key={item.id}
              href={item.href}
              aria-label={item.aria}
              aria-current={on ? 'page' : undefined}
              className="flex min-w-0 items-center justify-center gap-1.5 rounded-xl px-1.5 py-2.5 text-center text-[12px] font-bold"
              style={{
                background: on ? 'var(--court)' : 'transparent',
                color: on ? 'var(--night-court-ink)' : dark ? 'var(--night-text2)' : 'var(--ink-3)',
              }}
            >
              <span className="inline-flex shrink-0">{item.icon}</span>
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
