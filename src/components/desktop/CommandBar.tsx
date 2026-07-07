'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

/* ⌘K / Ctrl-K command palette. Ported from the handoff chrome.js
   TTD.commandBar(): grouped commands, arrow-key nav, filter, Enter to run.
   Surfaces opt in by rendering <CommandBar /> and can pass context-aware
   commands (e.g. routes that include the current tournament id). The
   default set covers the global create / go-to / settings actions. */

export interface Command {
  group: string;
  label: string;
  hint?: string;
  icon?: string;
  run: () => void;
}

/* Serializable command (href instead of a run closure) so server components can
   contribute context-aware commands through DesktopSurface. */
export interface NavCommand {
  group: string;
  label: string;
  href: string;
  hint?: string;
  icon?: string;
}

export function CommandBar({ commands, navCommands }: { commands?: Command[]; navCommands?: NavCommand[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const allCommands = useMemo<Command[]>(() => {
    // A client caller can pass a fully-custom set that overrides everything.
    if (commands && commands.length) return commands;
    // Context (nav) commands from the current surface come first, then the
    // always-available globals.
    const ctx: Command[] = (navCommands ?? []).map((n) => ({
      group: n.group,
      label: n.label,
      hint: n.hint,
      icon: n.icon,
      run: () => router.push(n.href),
    }));
    const globals: Command[] = [
      { group: 'Create', label: 'New event', hint: 'C', icon: '＋', run: () => router.push('/tournaments/new') },
      { group: 'Go to', label: 'My tournaments', hint: 'G T', icon: '▦', run: () => router.push('/tournaments') },
      { group: 'Go to', label: 'Today', hint: 'G H', icon: '⌂', run: () => router.push('/') },
      { group: 'Go to', label: 'History', hint: 'G Y', icon: '★', run: () => router.push('/history') },
      { group: 'Go to', label: 'Profile', hint: 'G P', icon: '◎', run: () => router.push('/profile') },
    ];
    return [...ctx, ...globals];
  }, [commands, navCommands, router]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allCommands;
    return allCommands.filter((c) => `${c.label} ${c.group}`.toLowerCase().includes(q));
  }, [query, allCommands]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    }
    function onOpen() {
      setOpen(true);
    }
    document.addEventListener('keydown', onKey);
    window.addEventListener('ttd:open-command-bar', onOpen);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('ttd:open-command-bar', onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSel(0);
      // focus after paint
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    if (sel > filtered.length - 1) setSel(Math.max(0, filtered.length - 1));
  }, [filtered, sel]);

  if (!open) return null;

  function run(c: Command | undefined) {
    if (!c) return;
    setOpen(false);
    c.run();
  }

  function onInputKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSel((s) => Math.min(s + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSel((s) => Math.max(s - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      run(filtered[sel]);
    }
  }

  // group headers in render order
  let lastGroup = '';

  return (
    <div
      role="dialog"
      aria-label="Command bar"
      className="fixed inset-0 z-[120] flex items-start justify-center pt-[14vh]"
      style={{ background: 'color-mix(in oklch, #000 46%, transparent)', backdropFilter: 'blur(3px)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div
        className="w-[min(640px,92vw)] overflow-hidden rounded-[18px] border"
        style={{
          background: 'var(--surface-card)',
          borderColor: 'var(--line-2)',
          boxShadow: '0 40px 90px -30px rgba(0,0,0,.5)',
          animation: 'slideUp .16s ease both',
        }}
      >
        <div className="flex items-center gap-3 border-b p-[16px_18px]" style={{ borderColor: 'var(--line)' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--text3)' }} aria-hidden="true">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.7" />
            <path d="M20 20l-3.2-3.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="Search events, players, actions…"
            aria-label="Search commands"
            className="flex-1 border-none bg-transparent text-[17px] outline-none"
            style={{ color: 'var(--text)' }}
          />
          <kbd
            className="rounded-[6px] border px-[7px] py-[3px] font-mono text-[10.5px]"
            style={{ background: 'var(--surface-inset)', borderColor: 'var(--line)', color: 'var(--text3)' }}
          >
            ESC
          </kbd>
        </div>
        <div className="max-h-[52vh] overflow-auto p-2" role="listbox">
          {filtered.length === 0 ? (
            <div className="py-[34px] text-center text-[14px]" style={{ color: 'var(--text3)' }}>
              No matches for “{query}”
            </div>
          ) : (
            filtered.map((c, i) => {
              const showGroup = c.group !== lastGroup;
              lastGroup = c.group;
              const selected = i === sel;
              return (
                <div key={`${c.group}-${c.label}`}>
                  {showGroup ? (
                    <div
                      className="px-3 pb-1.5 pt-3 font-mono text-[10px] uppercase tracking-[.12em]"
                      style={{ color: 'var(--text3)' }}
                    >
                      {c.group}
                    </div>
                  ) : null}
                  <div
                    role="option"
                    aria-selected={selected}
                    className="flex cursor-pointer items-center gap-3 rounded-[11px] p-[11px_12px]"
                    style={selected ? { background: 'color-mix(in oklch, var(--accent) 14%, transparent)' } : undefined}
                    onMouseEnter={() => setSel(i)}
                    onClick={() => run(c)}
                  >
                    <span
                      className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-[9px]"
                      style={
                        selected
                          ? { background: 'var(--accent)', color: 'var(--accent-ink)' }
                          : { background: 'var(--surface-inset)', color: 'var(--text2)' }
                      }
                    >
                      {c.icon ?? '›'}
                    </span>
                    <span className="flex-1 text-[14.5px] font-semibold" style={{ color: 'var(--text)' }}>
                      {c.label}
                    </span>
                    {c.hint ? (
                      <span className="font-mono text-[11px]" style={{ color: 'var(--text3)' }}>
                        {c.hint}
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
