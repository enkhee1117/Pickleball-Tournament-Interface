import type { ConfigRow } from '../_types';

// Small pure helpers + config-adjacent types used across the admin surfaces.
// No React, no Supabase.

export type PrizeBuckets = {
  tournament: number;
  raffle: number;
  betting: number;
  reserve: number;
};

export type OrganizerTab = 'run' | 'roster' | 'scores' | 'standings' | 'prizes' | 'setup';

export const ORGANIZER_TABS: Array<{ id: OrganizerTab; label: string; description: string }> = [
  { id: 'run', label: 'Run', description: 'Ballot and draw' },
  { id: 'roster', label: 'Roster', description: 'Players and payments' },
  { id: 'scores', label: 'Scores', description: 'Courts and results' },
  { id: 'standings', label: 'Standings', description: 'Live board and podium' },
  { id: 'prizes', label: 'Prizes', description: 'Pots and raffle' },
  { id: 'setup', label: 'Setup', description: 'Rules and money' },
];

export function getOrganizerTab(value: string | undefined): OrganizerTab {
  return ORGANIZER_TABS.some((tab) => tab.id === value) ? (value as OrganizerTab) : 'run';
}

export function runEventHeadline(state: string) {
  switch (state) {
    case 'open': return 'Ballot is live';
    case 'locked': return 'Ballot locked';
    case 'drawing': return 'Drawing partners';
    case 'revealed': return 'Pairings revealed';
    case 'playing': return 'Games are on court';
    case 'done': return 'Round complete';
    default: return 'Ready to run';
  }
}

export function runEventBody(state: string, lockMode: ConfigRow['lock_mode']) {
  switch (state) {
    case 'open':
      return lockMode === 'timer'
        ? 'Players are voting now. The configured timer will define when ballots should close.'
        : 'Players are voting now. Lock the ballot manually when the room is ready.';
    case 'locked':
      return 'Votes are sealed. Draw and reveal when players are watching.';
    case 'drawing':
      return 'The draw is in progress. Keep presentation mode ready for the reveal.';
    case 'revealed':
      return 'Partners and courts are visible. Start play when everyone reaches their court.';
    case 'playing':
      return 'Enter scores as courts finish so standings, raffle, and pools can settle cleanly.';
    case 'done':
      return 'Scores are in. Finalize the event or prepare the next voting window.';
    default:
      return 'Open the ballot to begin the Mixer round loop.';
  }
}

export function money(value: number) {
  return `$${Math.round(value).toLocaleString()}`;
}

export function formatLockDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const remainder = seconds % 3600;
  if (hours > 0 && remainder > 0) return `${hours}h ${remainder}s`;
  if (hours > 0) return `${hours}h`;
  return `${seconds}s`;
}

export function normalizePrizeBuckets(value: unknown): PrizeBuckets {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { tournament: 0.5, raffle: 0.2, betting: 0.2, reserve: 0.1 };
  }
  const record = value as Record<string, unknown>;
  return {
    tournament: toFraction(record.tournament, 0.5),
    raffle: toFraction(record.raffle, 0.2),
    betting: toFraction(record.betting, 0.2),
    reserve: toFraction(record.reserve, 0.1),
  };
}

function toFraction(value: unknown, fallback: number) {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(1, numeric));
}
