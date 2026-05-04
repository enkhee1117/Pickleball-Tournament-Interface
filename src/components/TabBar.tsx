'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

type Tab = {
  id: string;
  label: string;
  href: string;
  icon: ReactNode;
  match: (pathname: string) => boolean;
};

const TABS: Tab[] = [
  {
    id: 'home',
    label: 'Today',
    href: '/',
    match: (p) => p === '/',
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <path d="M3 11l8-7 8 7v8a1 1 0 01-1 1h-4v-6h-6v6H4a1 1 0 01-1-1v-8z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'play',
    label: 'Play',
    href: '/tournaments',
    match: (p) => p.startsWith('/tournaments'),
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="1.6" />
        <path d="M3 11h16M11 3a12 12 0 010 16M11 3a12 12 0 000 16" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    ),
  },
  {
    id: 'stats',
    label: 'Stats',
    href: '/history',
    match: (p) => p.startsWith('/history') || p.startsWith('/stats'),
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <rect x="4" y="11" width="3.5" height="7" rx="1" stroke="currentColor" strokeWidth="1.6" />
        <rect x="9.25" y="6" width="3.5" height="12" rx="1" stroke="currentColor" strokeWidth="1.6" />
        <rect x="14.5" y="9" width="3.5" height="9" rx="1" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    ),
  },
  {
    id: 'me',
    label: 'Me',
    href: '/profile',
    match: (p) => p.startsWith('/profile'),
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <circle cx="11" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.6" />
        <path d="M4 19c1-3.5 4-5 7-5s6 1.5 7 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
];

const HIDDEN_PATH_PREFIXES = ['/login', '/signup', '/onboarding', '/join', '/match'];
const HIDDEN_EXACT = new Set<string>();
const HIDDEN_PATTERNS = [/^\/tournaments\/new(\/|$)/, /^\/tournaments\/[^/]+\/(invite|match|create)(\/|$)/];

export function TabBar() {
  const pathname = usePathname() || '/';

  if (
    HIDDEN_EXACT.has(pathname) ||
    HIDDEN_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ||
    HIDDEN_PATTERNS.some((re) => re.test(pathname))
  ) {
    return null;
  }

  return (
    <nav
      className="fixed bottom-0 left-1/2 z-40 w-full max-w-[480px] -translate-x-1/2 border-t bg-paper px-2 pt-2 pb-[max(env(safe-area-inset-bottom),6px)]"
      style={{ borderColor: 'var(--line)' }}
    >
      <div className="flex">
        {TABS.map((t) => {
          const on = t.match(pathname);
          return (
            <Link
              key={t.id}
              href={t.href}
              className="relative flex flex-1 flex-col items-center gap-[3px] px-1 py-2 transition"
              style={{ color: on ? 'var(--ink)' : 'var(--ink-3)' }}
            >
              {on && (
                <span
                  className="absolute -top-2 left-1/2 h-[3px] w-6 -translate-x-1/2 rounded-full"
                  style={{ background: 'var(--court)' }}
                />
              )}
              {t.icon}
              <span className="text-[10.5px] font-semibold tracking-wide">{t.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
