'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

export type RecordingItem = {
  matchId: string;
  tournamentId: string;
  roundLabel: string | null;
  courtLabel: string | null;
  teamALabel: string;
  teamBLabel: string;
  url: string;
};

// Pop-out menu hung off the YouTube icon in the tournament hero. Lists every
// match recording for the tournament and links each entry to the match score
// screen (so the user lands on the same page they'd hit via the matches tab,
// not directly on YouTube — that way they can edit the link if they're a
// manager). Closes on outside-click and Escape.
export function RecordingsMenu({
  recordings,
  dark = false,
}: {
  recordings: RecordingItem[];
  dark?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (recordings.length === 0) return null;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`${recordings.length} match recording${recordings.length === 1 ? '' : 's'}`}
        aria-expanded={open}
        className="relative flex h-10 w-10 items-center justify-center rounded-xl"
        style={{ color: '#FF0033' }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="2" y="5" width="20" height="14" rx="3" fill="currentColor" />
          <path d="M10 9.5v5l4.5-2.5L10 9.5z" fill={dark ? 'var(--ink)' : '#fff'} />
        </svg>
        <span
          className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold leading-none text-white"
          style={{ background: '#FF0033' }}
        >
          {recordings.length}
        </span>
      </button>
      {open && (
        <div
          className="absolute right-0 top-12 z-20 w-[280px] overflow-hidden rounded-2xl shadow-lg"
          style={{ background: '#fff', border: '1px solid var(--line)' }}
        >
          <div
            className="flex items-center justify-between px-3.5 py-2.5"
            style={{ borderBottom: '1px solid var(--line)' }}
          >
            <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
              Recordings
            </div>
            <div className="text-[11px] text-ink-3">{recordings.length}</div>
          </div>
          <div className="max-h-[320px] overflow-y-auto">
            {recordings.map((r) => {
              const isYouTube = /(?:youtube\.com|youtu\.be)/i.test(r.url);
              return (
                <Link
                  key={r.matchId}
                  href={`/tournaments/${r.tournamentId}/match/${r.matchId}`}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 px-3.5 py-2.5 text-left"
                  style={{ borderBottom: '1px solid var(--line)' }}
                >
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] text-white"
                    style={{ background: isYouTube ? '#FF0033' : 'var(--ink)' }}
                  >
                    ▶
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12px] font-semibold text-ink">
                      {r.teamALabel} vs {r.teamBLabel}
                    </div>
                    <div className="truncate text-[10.5px] text-ink-3">
                      {[r.roundLabel, r.courtLabel].filter(Boolean).join(' · ') || 'Match'}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
