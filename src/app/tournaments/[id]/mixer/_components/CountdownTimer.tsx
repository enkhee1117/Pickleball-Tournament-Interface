'use client';

import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';

// Live countdown to a round's ballot lock (mixer_rounds.lock_at). Ticks each
// second on the client so the server page never has to re-render per second.
// Shows mm:ss (h:mm:ss for long windows) and a "closed" state at zero.
//
// Rendered by both the player vote panel and the organizer ballot card — the
// two places a real voting timer belongs. It stays null until mounted so SSR
// and the first client render agree (no hydration mismatch), then it starts.
export function CountdownTimer({
  lockAt,
  active = true,
  prefix,
  closedLabel = 'Voting closed',
  className,
  style,
}: {
  lockAt: string | null | undefined;
  active?: boolean;
  prefix?: string;
  closedLabel?: string;
  className?: string;
  style?: CSSProperties;
}) {
  const target = lockAt ? new Date(lockAt).getTime() : null;
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    if (!active || target == null || !Number.isFinite(target)) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active, target]);

  if (!active || target == null || !Number.isFinite(target) || now == null) return null;

  const remaining = Math.max(0, Math.floor((target - now) / 1000));
  return (
    <span className={className} style={style}>
      {remaining <= 0 ? closedLabel : `${prefix ?? ''}${formatCountdown(remaining)}`}
    </span>
  );
}

function formatCountdown(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
