import Link from 'next/link';
import type { Profile } from '@/lib/types';

const LINKS = [
  { href: '/', label: 'Home' },
  { href: '/tournaments', label: 'Tournaments' },
  { href: '/scoreboard', label: 'Scoreboard' },
  { href: '/history', label: 'History' },
  { href: '/profile', label: 'Profile' },
];

export function Nav({ profile }: { profile: Profile | null }) {
  return (
    <nav className="glass-panel sticky top-0 z-40 flex items-center gap-2 border-b border-border-dark px-3 py-2 text-sm">
      <Link href="/" className="mr-3 flex items-center gap-2 font-display font-bold tracking-tight text-volt">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="2" y="2" width="20" height="20" rx="4" stroke="currentColor" strokeWidth="2" />
          <circle cx="12" cy="12" r="4" fill="currentColor" />
          <path d="M12 2v20M2 12h20" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4" />
        </svg>
        TourneyPal
      </Link>
      <div className="flex flex-1 items-center gap-1 overflow-x-auto rounded-md border border-border-dark bg-dark-bg p-1">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="rounded px-3 py-1.5 text-text-muted hover:bg-slate-800 hover:text-white">
            {l.label}
          </Link>
        ))}
        {profile && (profile.role === 'admin' || profile.role === 'organizer') && (
          <Link href="/admin" className="rounded px-3 py-1.5 text-amber-400 hover:bg-slate-800">
            Admin
          </Link>
        )}
      </div>
      <div className="flex items-center gap-2">
        {profile ? (
          <>
            <span className="hidden text-text-muted sm:inline">{profile.display_name}</span>
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
