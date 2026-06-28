import Link from 'next/link';

type MixerMode = 'event' | 'player' | 'organizer' | 'present';

export function MixerModeSwitch({ tournamentId, active, dark = true }: { tournamentId: string; active: MixerMode; dark?: boolean }) {
  const items: Array<{ id: MixerMode; label: string; href: string }> = [
    { id: 'event', label: 'Event', href: `/tournaments/${tournamentId}` },
    { id: 'player', label: 'Player', href: `/tournaments/${tournamentId}/mixer` },
    { id: 'organizer', label: 'Organizer', href: `/tournaments/${tournamentId}/mixer/admin` },
    { id: 'present', label: 'Present', href: `/tournaments/${tournamentId}/mixer/present` },
  ];
  return (
    <nav
      aria-label="Mixer view switcher"
      className="mx-[18px] mb-3 grid grid-cols-4 gap-1 rounded-2xl p-1"
      style={{
        background: dark ? 'oklch(0.215 0.03 264)' : 'var(--paper-2)',
        border: dark ? '1px solid oklch(0.36 0.04 266)' : '1px solid var(--line)',
      }}
    >
      {items.map((item) => {
        const on = active === item.id;
        return (
          <Link
            key={item.id}
            href={item.href}
            aria-current={on ? 'page' : undefined}
            className="rounded-xl px-2 py-2.5 text-center text-[12px] font-bold"
            style={{
              background: on ? 'var(--court)' : 'transparent',
              color: on ? 'oklch(0.2 0.04 140)' : dark ? 'oklch(0.78 0.028 264)' : 'var(--ink-3)',
            }}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
