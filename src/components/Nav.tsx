import Link from 'next/link';
import type { Profile } from '@/lib/types';

const LINKS = [
  { href: '/', label: 'Home' },
  { href: '/scoreboard', label: 'Scoreboard' },
  { href: '/chat', label: 'Chat' },
  { href: '/profile', label: 'Profile' },
];

export function Nav({ profile }: { profile: Profile | null }) {
  return (
    <nav className="sticky top-0 z-40 flex items-center gap-1 border-b border-neutral-800 bg-neutral-950 px-3 py-2 text-sm">
      <Link href="/" className="mr-3 font-bold tracking-tight">MLP</Link>
      <div className="flex flex-1 items-center gap-1 overflow-x-auto">
        {profile && LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="rounded px-3 py-1.5 text-neutral-300 hover:bg-neutral-800 hover:text-white">
            {l.label}
          </Link>
        ))}
        {profile && (profile.role === 'admin' || profile.role === 'organizer') && (
          <Link href="/admin" className="rounded px-3 py-1.5 text-amber-400 hover:bg-neutral-800">
            Admin
          </Link>
        )}
      </div>
      <div className="flex items-center gap-2">
        {profile ? (
          <>
            <span className="hidden text-neutral-400 sm:inline">{profile.display_name}</span>
            <form action="/auth/signout" method="post">
              <button className="btn btn-ghost" type="submit">Sign out</button>
            </form>
          </>
        ) : (
          <Link href="/login" className="btn btn-primary">Sign in</Link>
        )}
      </div>
    </nav>
  );
}
