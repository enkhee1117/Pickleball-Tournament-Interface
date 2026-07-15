'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { setTheme } from '@/app/theme-actions';
import { THEMES, type Theme } from '@/lib/theme';
import { toggleTheme } from '@/lib/theme-client';
import { shortFromName } from '@/components/ui/Avatar';
import { useAccount } from './account-context';

/* The avatar dropdown from the desktop chrome handoff (.ttd-acct-menu):
   identity header, the two personal destinations, the theme switch, and a
   de-emphasized Sign out. Token-driven so it renders in both themes. */

const ITEM =
  'flex w-full items-center gap-3 rounded-[10px] px-[11px] py-[9px] text-left text-[14px] font-medium transition hover:bg-[var(--paper-2)] hover:text-[var(--ink)]';

export function AccountMenu({ theme }: { theme: Theme }) {
  const account = useAccount();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const nextTheme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!account) return null;

  const close = () => setOpen(false);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Your account"
        onClick={() => setOpen((o) => !o)}
        className="av h-10 w-10 cursor-pointer transition-[box-shadow] duration-150 hover:[box-shadow:0_0_0_2px_var(--bg),0_0_0_4px_color-mix(in_oklch,var(--court)_55%,transparent)]"
        style={open ? { boxShadow: '0 0 0 2px var(--bg), 0 0 0 4px var(--court)' } : undefined}
      >
        {account.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={account.avatarUrl} alt="" />
        ) : (
          <span className="text-[13px]" style={{ color: 'var(--ink-2)' }}>
            {shortFromName(account.name)}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Account"
          className="animate-slide-up overflow-hidden"
          style={{
            position: 'absolute',
            top: 'calc(100% + 10px)',
            right: 0,
            width: 266,
            zIndex: 70,
            background: 'var(--card)',
            border: '1px solid var(--line)',
            borderRadius: 16,
            boxShadow: '0 30px 64px -26px rgba(0,0,0,.5)',
          }}
        >
          {/* identity header — non-interactive */}
          <div
            className="flex items-center gap-3 px-4 py-[15px]"
            style={{ borderBottom: '1px solid var(--line)' }}
          >
            <span className="av h-[42px] w-[42px] shrink-0">
              {account.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={account.avatarUrl} alt="" />
              ) : (
                <span className="text-[14px]" style={{ color: 'var(--ink-2)' }}>
                  {shortFromName(account.name)}
                </span>
              )}
            </span>
            <div className="min-w-0">
              <div className="truncate text-[14.5px] font-semibold" style={{ color: 'var(--ink)' }}>
                {account.name}
              </div>
              <div
                className="mono mt-0.5 truncate text-[10.5px] tracking-[0.02em]"
                style={{ color: 'var(--ink-3)' }}
              >
                @{account.handle} · {account.sub}
              </div>
            </div>
          </div>

          <div className="p-[7px]" style={{ color: 'var(--ink-2)' }}>
            <Link href="/profile" role="menuitem" className={ITEM} onClick={close} style={{ color: 'inherit' }}>
              {ICON_PROFILE}
              Profile
            </Link>
            <Link href="/history" role="menuitem" className={ITEM} onClick={close} style={{ color: 'inherit' }}>
              {ICON_HISTORY}
              History
            </Link>
            <form action={setTheme} onSubmit={close}>
              <input type="hidden" name="theme" value={nextTheme} />
              <button
                type="submit"
                role="menuitem"
                className={ITEM}
                style={{ color: 'inherit' }}
                onClick={(e) => {
                  // Optimistic flip — no server round-trip / full-tree refetch.
                  e.preventDefault();
                  toggleTheme();
                  close();
                }}
              >
                {ICON_THEME}
                Switch theme
                <span
                  className="mono ml-auto rounded-[5px] px-1.5 text-[10.5px]"
                  style={{ background: 'var(--paper-2)', border: '1px solid var(--line)', color: 'var(--ink-3)' }}
                >
                  T
                </span>
              </button>
            </form>
          </div>

          <div style={{ height: 1, background: 'var(--line)' }} />

          <div className="p-[7px]">
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                role="menuitem"
                onClick={close}
                className="flex w-full items-center gap-3 rounded-[10px] px-[11px] py-[9px] text-left text-[14px] font-medium transition hover:bg-[color-mix(in_oklch,var(--berry)_12%,transparent)]"
                style={{ color: 'var(--berry)' }}
              >
                {ICON_SIGNOUT}
                Sign out
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const ICON_PROFILE = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="8" r="3.4" stroke="currentColor" strokeWidth="1.7" />
    <path d="M5.5 19.5a6.5 6.5 0 0113 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);

const ICON_HISTORY = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M8 21h8M12 17v4M6 4h12v5a6 6 0 01-12 0V4z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
  </svg>
);

const ICON_THEME = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M20 14.5A8 8 0 0 1 9.5 4 7 7 0 1 0 20 14.5z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
  </svg>
);

const ICON_SIGNOUT = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M15 12H4m0 0l3.5-3.5M4 12l3.5 3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M11 5.5V5a2 2 0 012-2h5a2 2 0 012 2v14a2 2 0 01-2 2h-5a2 2 0 01-2-2v-.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);
