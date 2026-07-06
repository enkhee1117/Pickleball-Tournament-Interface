'use client';

import { useState, type ReactNode } from 'react';

// The player's "night" view (handoff player.html): a segmented control that
// walks the round's three phases — Voting → Ballot locked → Teams revealed —
// with the live phase marked by a dot. It defaults to whatever phase the round
// is actually in, and the player can tap ahead/back to preview the others. The
// three panes are built server-side and passed in as children.
export type NightPhase = 'voting' | 'locked' | 'revealed';

const TABS: { id: NightPhase; label: string }[] = [
  { id: 'voting', label: 'Voting' },
  { id: 'locked', label: 'Ballot locked' },
  { id: 'revealed', label: 'Teams revealed' },
];

export function PlayerNightShell({
  livePhase,
  voting,
  locked,
  revealed,
}: {
  livePhase: NightPhase;
  voting: ReactNode;
  locked: ReactNode;
  revealed: ReactNode;
}) {
  const [phase, setPhase] = useState<NightPhase>(livePhase);
  const panes: Record<NightPhase, ReactNode> = { voting, locked, revealed };

  return (
    <div className="px-[18px]">
      <div className="mb-4 flex items-center gap-2">
        <span className="mono hidden shrink-0 text-[10px] font-bold uppercase tracking-[0.14em] sm:inline" style={{ color: 'var(--night-text3)' }}>
          Player&apos;s night
        </span>
        <div
          className="flex flex-1 rounded-full p-1"
          style={{ background: 'var(--night-inset)', border: '1px solid var(--night-line)' }}
          role="tablist"
          aria-label="Round phase"
        >
          {TABS.map((t) => {
            const on = phase === t.id;
            const isLive = livePhase === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setPhase(t.id)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-full px-2 py-2 text-[12.5px] font-semibold transition-colors"
                style={on ? { background: 'var(--court)', color: 'var(--night-court-ink)' } : { color: 'var(--night-text2)' }}
              >
                {isLive && (
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${on ? '' : 'animate-pulse-dot'}`}
                    style={{ background: on ? 'var(--night-court-ink)' : 'var(--court)' }}
                  />
                )}
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {panes[phase]}
    </div>
  );
}
