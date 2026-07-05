import { tallyGames, type CourtResult } from '@/lib/mixer-standings';

// The ".tprog" strip from the design handoff: a headline count of games final,
// a segmented bar grouped by round (green = final, pulsing orange = on court
// now, muted = upcoming), and a caption of what's left. Rendered atop both the
// Scores and Standings surfaces. Reads only from CourtResult[] so it works
// anywhere those are available; colors come from CSS vars so it adapts to the
// active theme (light board / dark player surface alike).
export function GamesProgressStrip({
  results,
  className = '',
}: {
  results: CourtResult[];
  className?: string;
}) {
  const { total, fin, live, left } = tallyGames(results);
  const pct = total > 0 ? Math.round((fin / total) * 100) : 0;

  // Segments in play order, split into per-round groups so the bar reads as
  // "these belong to round 1, these to round 2…" with a gap between groups.
  const groups = new Map<number, CourtResult[]>();
  for (const r of results) {
    groups.set(r.roundNo, [...(groups.get(r.roundNo) ?? []), r]);
  }
  const rounds = [...groups.keys()].sort((a, b) => a - b);

  return (
    <div
      className={`flex flex-wrap items-center gap-x-5 gap-y-3 rounded-card border p-3.5 ${className}`}
      style={{ background: 'var(--surface-inset)', borderColor: 'var(--line)' }}
    >
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-2xl font-bold leading-none tracking-tight" style={{ color: 'var(--ink)' }}>
          {fin}
          <span style={{ color: 'var(--ink-3)' }}>/{total}</span>
        </span>
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-3)' }}>
          games final
        </span>
      </div>

      <div className="flex min-w-[140px] flex-1 items-center gap-2" aria-hidden>
        {rounds.map((rn) => (
          <div key={rn} className="flex gap-[3px]">
            {groups.get(rn)!.map((g) => {
              const state = g.completed ? 'final' : g.editable ? 'live' : 'up';
              const bg =
                state === 'final'
                  ? 'var(--court)'
                  : state === 'live'
                    ? 'var(--serve)'
                    : 'var(--line-2)';
              return (
                <span
                  key={g.key}
                  className={`h-3.5 w-2 rounded-sm ${state === 'live' ? 'animate-pulse-dot' : ''}`}
                  style={{ background: bg }}
                />
              );
            })}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <span className="font-mono text-[12px]" style={{ color: 'var(--ink-2)' }}>
          {left} left to play
          {live > 0 && (
            <>
              {' · '}
              <span style={{ color: 'var(--serve)' }}>{live} on court now</span>
            </>
          )}
        </span>
        <span className="font-mono text-[12px] font-semibold" style={{ color: 'var(--court-deep)' }}>
          {pct}%
        </span>
      </div>
    </div>
  );
}
