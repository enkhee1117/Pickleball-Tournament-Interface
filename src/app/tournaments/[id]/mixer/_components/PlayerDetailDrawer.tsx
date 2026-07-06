'use client';

import { useEffect } from 'react';
import { Avatar, type AvatarPlayer } from '@/components/ui/Avatar';
import type { PlayerGames } from '@/lib/mixer-standings';

// Slide-over drawer for a standings row (handoff: clicking a player opens their
// detail without leaving the live board). Shows rank, record, points, diff, and
// a games-played / games-to-play breakdown. Presentational — the board owns the
// open/close state and supplies the selected player's numbers.
export interface PlayerDetail {
  playerId: string;
  name: string;
  avatar: AvatarPlayer;
  rank: number;
  wins: number;
  losses: number;
  points: number;
  pointDiff: number;
  games: PlayerGames;
  isSelf?: boolean;
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="rounded-xl p-3" style={{ background: 'var(--surface-inset)', border: '1px solid var(--line)' }}>
      <div className="mono text-2xl font-bold leading-none" style={{ color: tone ?? 'var(--ink)' }}>{value}</div>
      <div className="mono mt-1 text-[10px] uppercase tracking-[.1em]" style={{ color: 'var(--ink-3)' }}>{label}</div>
    </div>
  );
}

export function PlayerDetailDrawer({ detail, onClose }: { detail: PlayerDetail | null; onClose: () => void }) {
  useEffect(() => {
    if (!detail) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [detail, onClose]);

  if (!detail) return null;
  const { games } = detail;
  const toPlay = Math.max(0, games.scheduled - games.played);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={`${detail.name} details`}>
      <div
        className="absolute inset-0"
        style={{ background: 'color-mix(in oklch, var(--ink) 45%, transparent)', backdropFilter: 'blur(2px)' }}
        onClick={onClose}
      />
      <aside
        className="relative flex h-full w-full max-w-[380px] flex-col overflow-y-auto p-6"
        style={{ background: 'var(--card)', borderLeft: '1px solid var(--line)', boxShadow: '-24px 0 60px -20px color-mix(in oklch, var(--ink) 40%, transparent)', animation: 'ttdSlideIn .28s cubic-bezier(.2,.8,.3,1) both' }}
      >
        <style>{`@keyframes ttdSlideIn{from{transform:translateX(24px);opacity:.4}to{transform:none;opacity:1}}`}</style>
        <div className="mb-5 flex items-start justify-between">
          <span className="mono rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: 'var(--surface-inset)', color: 'var(--ink-2)', border: '1px solid var(--line)' }}>
            #{detail.rank}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-9 w-9 place-items-center rounded-full"
            style={{ background: 'var(--surface-inset)', color: 'var(--ink-2)', border: '1px solid var(--line)' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          </button>
        </div>

        <div className="flex items-center gap-3.5">
          <Avatar player={detail.avatar} size={64} ring={detail.isSelf} />
          <div className="min-w-0">
            <div className="serif text-[26px] leading-none">{detail.isSelf ? 'You' : detail.name}</div>
            <div className="mono mt-1 text-[12px]" style={{ color: 'var(--ink-3)' }}>{detail.wins}–{detail.losses} record</div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2.5">
          <Stat label="Points" value={detail.points} tone="var(--court-deep)" />
          <Stat label="Diff" value={`${detail.pointDiff > 0 ? '+' : ''}${detail.pointDiff}`} />
          <Stat label="Wins" value={detail.wins} />
        </div>

        <div className="mt-4 rounded-xl p-4" style={{ background: 'var(--surface-inset)', border: '1px solid var(--line)' }}>
          <div className="mono mb-2 text-[10px] uppercase tracking-[.1em]" style={{ color: 'var(--ink-3)' }}>Games</div>
          <div className="flex items-center gap-2.5">
            <span className="flex gap-[4px]" aria-hidden>
              {Array.from({ length: games.scheduled }, (_, i) => {
                const live = games.onCourt && i === games.played;
                const bg = i < games.played ? 'var(--court)' : live ? 'var(--serve)' : 'var(--line-2)';
                return <span key={i} className={`h-2.5 w-2.5 rounded-full ${live ? 'animate-pulse-dot' : ''}`} style={{ background: bg }} />;
              })}
            </span>
            <span className="mono text-[13px]" style={{ color: 'var(--ink-2)' }}>
              <b style={{ color: 'var(--ink)' }}>{games.played}</b> played · <b style={{ color: 'var(--ink)' }}>{toPlay}</b> to play
              {games.onCourt ? <span style={{ color: 'var(--serve)' }}> · on court now</span> : null}
            </span>
          </div>
        </div>
      </aside>
    </div>
  );
}
