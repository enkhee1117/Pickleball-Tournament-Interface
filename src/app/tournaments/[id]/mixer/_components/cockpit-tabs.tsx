'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

// Client tab machinery for the organizer cockpit. The server renders all six
// tab panes; these primitives toggle which is visible with local state — no
// navigation, no refetch, no loading-skeleton flash on a tab click. URL stays
// in sync via the History API so refresh/share/back land on the right tab.
// Realtime router.refresh streams fresh pane content in and React reconciles it
// in place; the active tab never resets.

export type CockpitTab = 'run' | 'roster' | 'scores' | 'standings' | 'prizes' | 'setup';

const TAB_IDS: CockpitTab[] = ['run', 'roster', 'scores', 'standings', 'prizes', 'setup'];

const COCKPIT_TITLES: Record<CockpitTab, string> = {
  run: 'Run event',
  roster: 'Roster',
  scores: 'Scores',
  standings: 'Standings',
  prizes: 'Prizes',
  setup: 'Setup',
};

function cockpitSub(tab: CockpitTab, roundNo: number | null, state: string | null, players: number, paid: number, pending: number): string {
  switch (tab) {
    case 'run':
      return roundNo ? `Round ${roundNo} · ${state ?? 'setup'}` : 'Set up the event to begin';
    case 'roster':
      return `${players} players · ${paid} paid · ${pending} pending`;
    case 'scores':
      return 'Post scores court by court · game to 11, win by 2';
    case 'standings':
      return 'Live board · re-sorts as scores post';
    case 'prizes':
      return 'Entry pot, raffle & pooled betting';
    case 'setup':
      return 'Tokens, lock mode, draw weighting & payments';
    default:
      return '';
  }
}

const NAV_ITEMS: { tab: CockpitTab; label: string; icon: ReactNode }[] = [
  { tab: 'run', label: 'Run event', icon: <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /> },
  { tab: 'roster', label: 'Roster', icon: <path d="M9 8a3 3 0 106 0 3 3 0 00-6 0zM4 19c.8-3 2.8-4.4 5-4.4s4.2 1.4 5 4.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /> },
  { tab: 'scores', label: 'Scores', icon: <><rect x="4" y="4" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="1.6" /><path d="M8 9h8M8 13h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></> },
  { tab: 'standings', label: 'Standings', icon: <path d="M5 20V10M12 20V4M19 20v-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /> },
  { tab: 'prizes', label: 'Prizes', icon: <path d="M7 4h10v3a5 5 0 01-10 0V4zM9 15h6M8 20h8M12 15v5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /> },
  { tab: 'setup', label: 'Setup', icon: <><circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.5" /><path d="M12 3.5v2M12 18.5v2M4.5 7l1.7 1M17.8 16l1.7 1M4.5 17l1.7-1M17.8 8l1.7-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></> },
];

type Ctx = { active: CockpitTab; select: (tab: CockpitTab) => void };
const CockpitTabsContext = createContext<Ctx | null>(null);

function useCockpitTabs(): Ctx {
  const ctx = useContext(CockpitTabsContext);
  if (!ctx) throw new Error('Cockpit tab components must be used inside <CockpitTabsProvider>');
  return ctx;
}

export function CockpitTabsProvider({ tournamentId, initialTab, children }: { tournamentId: string; initialTab: CockpitTab; children: ReactNode }) {
  const base = `/tournaments/${tournamentId}/mixer/admin`;
  const [active, setActive] = useState<CockpitTab>(initialTab);

  const select = useCallback(
    (tab: CockpitTab) => {
      setActive(tab);
      const url = tab === 'run' ? base : `${base}?tab=${tab}`;
      if (typeof window !== 'undefined') window.history.pushState(null, '', url);
    },
    [base],
  );

  useEffect(() => {
    const onPop = () => {
      const t = new URLSearchParams(window.location.search).get('tab') as CockpitTab | null;
      setActive(t && TAB_IDS.includes(t) ? t : 'run');
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  return <CockpitTabsContext.Provider value={{ active, select }}>{children}</CockpitTabsContext.Provider>;
}

// One tab's content — mounted always (single-user page), shown only when active.
export function CockpitPanel({ id, children }: { id: CockpitTab; children: ReactNode }) {
  const { active } = useCockpitTabs();
  return <div hidden={active !== id}>{children}</div>;
}

// The cockpit sidebar nav — buttons that switch tabs client-side (was Links).
export function CockpitNavList({ pendingPayments }: { pendingPayments: number }) {
  const { active, select } = useCockpitTabs();
  return (
    <>
      {NAV_ITEMS.map((item) => {
        const on = active === item.tab;
        return (
          <button
            key={item.tab}
            type="button"
            onClick={() => select(item.tab)}
            aria-current={on ? 'page' : undefined}
            className="flex items-center gap-3 rounded-[11px] border px-3 py-2.5 text-left text-[14px] font-medium"
            style={
              on
                ? { background: 'color-mix(in oklch, var(--accent) 16%, transparent)', color: 'var(--text)', borderColor: 'color-mix(in oklch, var(--accent) 34%, transparent)' }
                : { color: 'var(--text2)', borderColor: 'transparent' }
            }
          >
            <span className="grid w-5 place-items-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>{item.icon}</svg>
            </span>
            {item.label}
            {item.tab === 'prizes' && pendingPayments > 0 ? (
              <span className="mono ml-auto rounded-full px-[7px] py-px text-[10px] font-bold text-white" style={{ background: 'var(--serve)' }}>
                {pendingPayments}
              </span>
            ) : null}
          </button>
        );
      })}
    </>
  );
}

// The topbar title/subtitle — recomputes per active tab from the (static) event
// counts passed in at render time.
export function CockpitTopbarTitle({ roundNo, state, players, paid, pending }: { roundNo: number | null; state: string | null; players: number; paid: number; pending: number }) {
  const { active } = useCockpitTabs();
  return (
    <div>
      <h1 className="text-[19px] font-semibold" style={{ color: 'var(--text)' }}>{COCKPIT_TITLES[active] ?? 'Cockpit'}</h1>
      <div className="mono text-[11px] tracking-[.06em]" style={{ color: 'var(--text3)' }}>{cockpitSub(active, roundNo, state, players, paid, pending)}</div>
    </div>
  );
}
