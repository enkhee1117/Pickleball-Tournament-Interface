'use client';

import Link from 'next/link';
import type { Theme } from '@/lib/theme';
import { BallMark } from './BallMark';
import { ThemeToggleButton } from './ThemeToggleButton';

/* Shared desktop nav — the React port of the handoff chrome.js TTD.mountNav:
   brand + optional event switcher + nav links + primary action + ⌘K search +
   theme toggle + avatar, with a Liberty stars-&-stripes top rule and a
   skip-link target. Sticky, blurred, theme-carrying. */

export interface NavLink {
  label: string;
  href: string;
}

export interface DesktopNavProps {
  event?: string;
  active?: string;
  links?: NavLink[];
  live?: boolean;
  primaryAction?: string;
  primaryHref?: string;
  onPrimary?: () => void;
  liberty?: boolean;
  theme: Theme;
  avatarSrc?: string;
  onEventClick?: () => void;
}

const DEFAULT_LINKS: NavLink[] = [
  { label: 'Today', href: '/' },
  { label: 'Tournaments', href: '/tournaments' },
  { label: 'Stats', href: '/history' },
];

export function DesktopNav({
  event,
  active,
  links = DEFAULT_LINKS,
  live,
  primaryAction,
  primaryHref,
  onPrimary,
  liberty = true,
  theme,
  avatarSrc,
  onEventClick,
}: DesktopNavProps) {
  function openCommandBar() {
    window.dispatchEvent(new Event('ttd:open-command-bar'));
  }

  return (
    <nav
      role="navigation"
      className={`sticky top-0 z-40 flex h-[66px] items-center gap-3 px-4 sm:gap-[22px] sm:px-8${liberty ? ' liberty-bar' : ''}`}
      style={{
        background: 'color-mix(in oklch, var(--bg) 86%, transparent)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--line)',
      }}
    >
      <div className="flex items-center gap-[9px]" style={{ color: 'var(--text)' }}>
        <BallMark size={30} />
        <span className="serif whitespace-nowrap text-[21px]" style={{ color: 'var(--text)' }}>
          Try to Dink
        </span>
        {liberty ? <span className="b250 hidden sm:inline-flex">★ 250</span> : null}
      </div>

      {event ? (
        <button
          type="button"
          onClick={onEventClick}
          className="inline-flex items-center gap-[9px] rounded-[11px] border px-3 py-[7px] text-[14px] font-semibold"
          style={{ borderColor: 'var(--line)', background: 'var(--surface-card)', color: 'var(--text)' }}
        >
          <span
            className="h-2 w-2 rounded-full"
            style={
              live
                ? { background: 'var(--serve)', boxShadow: '0 0 0 3px color-mix(in oklch, var(--serve) 25%, transparent)' }
                : { background: 'var(--text3)' }
            }
          />
          {event}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      ) : null}

      <div className="flex items-center gap-1">
        {links.map((l) => {
          const on = l.label === active;
          return (
            <Link
              key={l.label}
              href={l.href}
              className="rounded-[10px] px-[14px] py-2 text-[14px] font-medium"
              style={
                on
                  ? { background: 'var(--surface-raise)', color: 'var(--text)', fontWeight: 600 }
                  : { color: 'var(--text2)' }
              }
            >
              {l.label}
            </Link>
          );
        })}
      </div>

      <div className="ml-auto flex items-center gap-[10px]">
        {primaryAction ? (
          primaryHref ? (
            <Link href={primaryHref} className="btn btn-ghost btn-sm">
              {primaryAction}
            </Link>
          ) : (
            <button type="button" className="btn btn-ghost btn-sm" onClick={onPrimary}>
              {primaryAction}
            </button>
          )
        ) : null}

        <button
          type="button"
          onClick={openCommandBar}
          className="hidden h-10 items-center gap-[10px] rounded-[11px] border pl-[14px] pr-3 text-[13.5px] sm:inline-flex"
          style={{ borderColor: 'var(--line)', background: 'var(--surface-card)', color: 'var(--text3)' }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.7" />
            <path d="M20 20l-3.2-3.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
          Search
          <kbd
            className="rounded-[6px] border px-[6px] py-[2px] font-mono text-[11px]"
            style={{ background: 'var(--surface-inset)', borderColor: 'var(--line)', color: 'var(--text2)' }}
          >
            ⌘K
          </kbd>
        </button>

        <ThemeToggleButton theme={theme} />

        <span className="av h-10 w-10">
          {avatarSrc ? <img src={avatarSrc} alt="Your account" /> : null}
        </span>
      </div>
    </nav>
  );
}
