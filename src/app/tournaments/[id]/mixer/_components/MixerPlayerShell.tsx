'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { TopBar } from '@/components/ui/TopBar';
import { Chip } from '@/components/ui/Chip';
import { Icons } from '@/components/ui/icons';
import { BallMark } from '@/components/desktop';
import { formatInviteCode } from '@/lib/invite-codes';
import { MixerModeSwitch } from '../MixerModeSwitch';
import { MixerRealtimeSync } from '../MixerRealtimeSync';

export type PlayerTab = 'vote' | 'match' | 'courts' | 'betting' | 'me';

const TABS: [PlayerTab, string, ReactNode][] = [
  ['vote', 'Vote', <><rect x="4" y="4" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="1.7" /><path d="M8 11.5l2.5 2.5 5-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></>],
  ['match', 'Match', <><rect x="4" y="4" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="1.7" /><path d="M12 4v16" stroke="currentColor" strokeWidth="1.7" strokeDasharray="1.6 1.8" /></>],
  ['courts', 'Courts', <><rect x="3.5" y="6" width="7.5" height="12" rx="1.4" stroke="currentColor" strokeWidth="1.6" /><rect x="13" y="6" width="7.5" height="12" rx="1.4" stroke="currentColor" strokeWidth="1.6" /></>],
  ['betting', 'Pool', <><circle cx="9.5" cy="10" r="5" stroke="currentColor" strokeWidth="1.6" /><path d="M14.2 6.5A5 5 0 1115.5 16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></>],
  ['me', 'Me', <><circle cx="12" cy="8.5" r="3.3" stroke="currentColor" strokeWidth="1.7" /><path d="M5.5 19.5c.8-3.4 3.4-5.2 6.5-5.2s5.7 1.8 6.5 5.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></>],
];

type Props = {
  tournamentId: string;
  tournamentName: string;
  inviteCode: string;
  roundNo: number;
  roundState: string;
  playerName: string;
  isManager: boolean;
  initialTab: PlayerTab;
  tokensLeft: number;
  tokensTotal: number;
  overlays: ReactNode;
  panes: Record<PlayerTab, ReactNode>;
};

// Client tab shell for the player mixer. The server renders every pane once and
// hands them in as props; this component toggles which one is visible with
// local state — no navigation, no server round-trip, no loading skeleton on a
// tab click. The URL is kept in sync with the History API (Next-sanctioned
// pushState) so refresh/share/back still land on the right tab. Realtime
// (MixerRealtimeSync → router.refresh) streams fresh pane props into this shell
// and React reconciles them in place; the active tab never resets.
export function MixerPlayerShell({
  tournamentId,
  tournamentName,
  inviteCode,
  roundNo,
  roundState,
  playerName,
  isManager,
  initialTab,
  tokensLeft,
  tokensTotal,
  overlays,
  panes,
}: Props) {
  const base = `/tournaments/${tournamentId}/mixer`;
  const [active, setActive] = useState<PlayerTab>(initialTab);
  // Keep-alive: a pane is mounted the first time it's shown and stays mounted
  // (hidden) afterwards, so re-visiting is instant and preserves scroll/input.
  // Unvisited panes are never mounted, so their client JS never hydrates.
  const visited = useRef<Set<PlayerTab>>(new Set([initialTab]));

  const go = useCallback(
    (id: PlayerTab) => {
      visited.current.add(id);
      setActive(id);
      const url = id === 'vote' ? base : `${base}?tab=${id}`;
      if (typeof window !== 'undefined') window.history.pushState(null, '', url);
    },
    [base],
  );

  // Sync the active tab when the user navigates with the browser back/forward
  // buttons (History API entries we pushed above).
  useEffect(() => {
    const onPop = () => {
      const t = (new URLSearchParams(window.location.search).get('tab') as PlayerTab | null) ?? 'vote';
      const valid = TABS.some(([id]) => id === t) ? t : 'vote';
      visited.current.add(valid);
      setActive(valid);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  return (
    <div data-fullscreen className="mixer-themed min-h-[100dvh]" style={{ background: 'var(--night-bg)', color: 'var(--night-text)' }}>
      <MixerRealtimeSync tournamentId={tournamentId} />
      <a href="#main" className="skip-link">Skip to content</a>
      <div className="lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
        {/* Sidebar — desktop only */}
        <aside
          className="hidden lg:flex lg:h-screen lg:flex-col lg:gap-1 lg:sticky lg:top-0 lg:p-4"
          style={{ borderRight: '1px solid var(--night-line)', background: 'var(--night-nav)' }}
        >
          <div className="flex items-center gap-2.5 px-2 pb-4 pt-1.5">
            <BallMark size={26} />
            <span className="serif text-[20px]">Try to Dink</span>
          </div>
          <div className="mb-2 rounded-xl px-3 py-2.5" style={{ background: 'var(--night-card)', border: '1px solid var(--night-line)' }}>
            <div className="flex items-center gap-2 text-[13px] font-semibold">
              <Chip tone={roundState === 'open' ? 'court' : 'ghost'}>{roundState}</Chip>
              <span className="truncate">{tournamentName}</span>
            </div>
            <div className="mono mt-1 text-[10.5px] tracking-[0.06em]" style={{ color: 'var(--night-text3)' }}>
              ROUND {roundNo}{playerName ? ` · ${playerName.toUpperCase()}` : ''}
            </div>
          </div>
          {TABS.map(([id, label, icon]) => {
            const on = active === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => go(id)}
                className="flex items-center gap-3 rounded-[11px] border px-3 py-2.5 text-left text-[14px] font-medium"
                style={
                  on
                    ? { background: 'color-mix(in oklch, var(--court) 16%, transparent)', color: 'var(--night-text)', borderColor: 'color-mix(in oklch, var(--court) 34%, transparent)', fontWeight: 600 }
                    : { color: 'var(--night-nav-link)', borderColor: 'transparent' }
                }
              >
                <span className="grid w-5 place-items-center" style={{ color: on ? 'var(--court-deep)' : 'var(--night-text3)' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>{icon}</svg>
                </span>
                {label}
              </button>
            );
          })}
          <div className="flex-1" />
          {tokensTotal > 0 && (
            // Token budget well (handoff player.html .tokenwell) — a persistent
            // at-a-glance budget with the accent gradient. Display-only; the
            // ballot itself is where tokens get spent.
            <div
              className="mb-2 rounded-[14px] p-3.5"
              style={{
                background: 'linear-gradient(150deg, color-mix(in oklch, var(--court) 22%, var(--night-card)), var(--night-card))',
                border: '1px solid color-mix(in oklch, var(--court) 26%, var(--night-line))',
              }}
            >
              <div className="mono text-[10px] uppercase tracking-[0.1em]" style={{ color: 'var(--night-text3)' }}>Token budget</div>
              <div className="mono mt-1 text-[30px] font-bold leading-none tracking-[-0.02em]" style={{ color: 'var(--night-text)' }}>
                {tokensLeft}
                <span className="text-[15px]" style={{ color: 'var(--night-text3)' }}> / {tokensTotal} left</span>
              </div>
            </div>
          )}
          {isManager && (
            <Link href={`${base}/admin`} prefetch className="rounded-[11px] px-3 py-2.5 text-[13px] font-semibold" style={{ background: 'var(--night-card)', border: '1px solid var(--night-line)', color: 'var(--night-nav-link-strong)' }}>
              Organizer mode →
            </Link>
          )}
          <Link href={`/tournaments/${tournamentId}`} className="rounded-[11px] px-3 py-2.5 text-[13px] font-medium" style={{ color: 'var(--night-text3)' }}>
            ← Back to hub
          </Link>
        </aside>

        {/* Main column — centered on mobile, left-aligned against the sidebar on
            desktop (no dead gap between nav and content). */}
        <div className="mx-auto w-full max-w-[560px] lg:mx-0 lg:max-w-[1120px] lg:px-8">
          <div className="lg:hidden">
            <TopBar
              dark
              title={tournamentName}
              sub={`Player mode · Round ${roundNo} · ${roundState}`}
              left={<Link href={`/tournaments/${tournamentId}`} className="flex h-10 w-10 items-center justify-center rounded-xl">{Icons.back}</Link>}
            />
            {isManager && <MixerModeSwitch tournamentId={tournamentId} active="player" />}
          </div>
          <div id="main" className="px-[18px] pb-3 pt-4 lg:px-0">
            <div className="flex items-center justify-between gap-3 rounded-2xl p-4" style={{ background: 'var(--night-card)', border: '1px solid var(--night-line)' }}>
              <div>
                <Chip tone={roundState === 'open' ? 'court' : 'ghost'}>{roundState}</Chip>
                <div className="serif mt-2 text-[28px] leading-none">Blind partner vote</div>
                <div className="mt-1 text-xs" style={{ color: 'var(--night-text2)' }}>
                  {playerName ? `Playing as ${playerName}` : `Code ${formatInviteCode(inviteCode)}`}
                </div>
              </div>
              <div className="text-right">
                <div className="mono text-[22px] font-bold" style={{ color: 'var(--court)' }}>R{roundNo}</div>
                <div className="text-[10px] uppercase tracking-[0.08em]" style={{ color: 'var(--night-text3)' }}>No tallies</div>
              </div>
            </div>
          </div>
          <div className="pb-28 lg:pb-10">
            {overlays}
            {TABS.map(([id]) =>
              visited.current.has(id) ? (
                <div key={id} hidden={active !== id}>
                  {panes[id]}
                </div>
              ) : null,
            )}
          </div>
        </div>
      </div>

      {/* Bottom tab bar — mobile only */}
      <div className="fixed bottom-0 left-0 right-0 z-30 mx-auto grid max-w-md grid-cols-5 gap-1 p-2 lg:hidden" style={{ background: 'var(--night-bg)', borderTop: '1px solid var(--night-line)' }}>
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => go(id)}
            className="rounded-xl py-3 text-center text-[12px] font-bold"
            style={{
              background: active === id ? 'var(--court)' : 'transparent',
              color: active === id ? 'var(--night-court-ink)' : 'var(--night-text2)',
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
