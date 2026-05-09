// Playoff seeding helpers.
//
// After all round-robin matches in a pool are scored, the top 4 teams (or
// player draft, in rotating-partner formats) advance to a semifinals →
// final + 3rd-place bracket.
//
// Two seeding modes:
//
// 1. Fixed-partners (one pool):  Top 4 teams from team standings, paired
//    1v4, 2v3 in the semifinals. Winners play the gold final, losers play
//    the bronze match.
//
// 2. Fixed-partners (two pools): Crossover seeding —
//    Pool A #1 vs Pool B #2, Pool B #1 vs Pool A #2. Winners → gold,
//    losers → bronze.
//
// 3. Rotating partners (≥8 players): A draft forms 4 ad-hoc teams from the
//    individual standings. The #1 ranked player picks first from the pool
//    of players ranked 5-8, then #2 picks, then #3, and #4 takes whoever
//    remains. We model "best pick" as the highest-ranked available partner,
//    so the natural greedy result is 1+5, 2+6, 3+7, 4+8.
//
// All three modes produce the same downstream output: 4 match drafts with
// round_labels Semifinal 1 / Semifinal 2 / Final / 3rd place. Final and
// 3rd-place start with placeholder team labels ("Semifinal 1 winner",
// etc.) and get rewritten as the semifinals are scored.

import {
  computePlayerStandings,
  computeStandings,
  isRotatingPartnersData,
  type StandingRow,
  type StandingsMatch,
} from './scoring';

export const PLAYOFF_ROUND_LABELS = {
  semi1: 'Semifinal 1',
  semi2: 'Semifinal 2',
  final: 'Final',
  bronze: '3rd place',
} as const;

export const SEMI_LABELS = [PLAYOFF_ROUND_LABELS.semi1, PLAYOFF_ROUND_LABELS.semi2] as const;
export const ALL_PLAYOFF_LABELS = [
  PLAYOFF_ROUND_LABELS.semi1,
  PLAYOFF_ROUND_LABELS.semi2,
  PLAYOFF_ROUND_LABELS.final,
  PLAYOFF_ROUND_LABELS.bronze,
] as const;

export const SEMI_WINNER_PLACEHOLDERS = {
  [PLAYOFF_ROUND_LABELS.semi1]: 'Semifinal 1 winner',
  [PLAYOFF_ROUND_LABELS.semi2]: 'Semifinal 2 winner',
} as const;

export const SEMI_LOSER_PLACEHOLDERS = {
  [PLAYOFF_ROUND_LABELS.semi1]: 'Semifinal 1 loser',
  [PLAYOFF_ROUND_LABELS.semi2]: 'Semifinal 2 loser',
} as const;

export type PlayoffDraft = {
  round_label: (typeof ALL_PLAYOFF_LABELS)[number];
  court_label: string;
  team_a_label: string;
  team_b_label: string;
};

export type PlayoffSeedMode = 'fixed_one_pool' | 'fixed_two_pools' | 'rotating';

export type PlayoffSeedResult =
  | { ok: true; mode: PlayoffSeedMode; drafts: PlayoffDraft[]; teams: [string, string, string, string] }
  | { ok: false; error: string };

export type PlayoffOptions = {
  courtA?: string;
  courtB?: string;
  // When set, force a specific seeding mode. Otherwise we infer from the
  // shape of the completed matches.
  mode?: PlayoffSeedMode;
};

const DEFAULT_OPTS = { courtA: 'Court 1', courtB: 'Court 2' } as const;

// Single-pool fixed-partners: top 4 in raw seed order (1, 2, 3, 4).
export function fixedPartnerOnePoolTeams(teamStandings: StandingRow[]): string[] | null {
  if (teamStandings.length < 4) return null;
  return teamStandings.slice(0, 4).map((row) => row.team);
}

// Two-pool fixed-partners crossover: PoolA#1 vs PoolB#2, PoolB#1 vs PoolA#2.
// Returns the 4 teams in semifinal order: [s1A, s1B, s2A, s2B].
export function fixedPartnerTwoPoolTeams(
  poolA: StandingRow[],
  poolB: StandingRow[],
): string[] | null {
  if (poolA.length < 2 || poolB.length < 2) return null;
  return [poolA[0].team, poolB[1].team, poolB[0].team, poolA[1].team];
}

// Rotating partners with ≥8 players: top 4 each pick a partner from ranks 5-8.
// Greedy pick: #1 picks #5 (best of pool), #2 picks #6, #3 picks #7, #4 gets #8.
export function rotatingPartnerDraftTeams(playerStandings: StandingRow[]): string[] | null {
  if (playerStandings.length < 8) return null;
  const top = playerStandings.slice(0, 4);
  const pool = playerStandings.slice(4, 8);
  return [
    `${top[0].team} & ${pool[0].team}`,
    `${top[1].team} & ${pool[1].team}`,
    `${top[2].team} & ${pool[2].team}`,
    `${top[3].team} & ${pool[3].team}`,
  ];
}

// matchups come in match-pair order:
//   [semi1.team_a, semi1.team_b, semi2.team_a, semi2.team_b].
function buildDrafts(matchups: [string, string, string, string], opts: PlayoffOptions = {}): PlayoffDraft[] {
  const courtA = opts.courtA ?? DEFAULT_OPTS.courtA;
  const courtB = opts.courtB ?? DEFAULT_OPTS.courtB;
  const [s1A, s1B, s2A, s2B] = matchups;
  return [
    {
      round_label: PLAYOFF_ROUND_LABELS.semi1,
      court_label: courtA,
      team_a_label: s1A,
      team_b_label: s1B,
    },
    {
      round_label: PLAYOFF_ROUND_LABELS.semi2,
      court_label: courtB,
      team_a_label: s2A,
      team_b_label: s2B,
    },
    {
      round_label: PLAYOFF_ROUND_LABELS.final,
      court_label: courtA,
      team_a_label: SEMI_WINNER_PLACEHOLDERS[PLAYOFF_ROUND_LABELS.semi1],
      team_b_label: SEMI_WINNER_PLACEHOLDERS[PLAYOFF_ROUND_LABELS.semi2],
    },
    {
      round_label: PLAYOFF_ROUND_LABELS.bronze,
      court_label: courtB,
      team_a_label: SEMI_LOSER_PLACEHOLDERS[PLAYOFF_ROUND_LABELS.semi1],
      team_b_label: SEMI_LOSER_PLACEHOLDERS[PLAYOFF_ROUND_LABELS.semi2],
    },
  ];
}

// Build the bracket from an explicit 4-team seed. Used when the organizer
// hand-picks teams (typically for mixed RR where the auto-seeder can't tell
// who should partner whom). Caller passes teams in ranked order — matchups
// follow the standard 1v4, 2v3 split.
export function seedPlayoffsFromCustomTeams(
  teams: [string, string, string, string],
  opts: PlayoffOptions = {},
): PlayoffSeedResult {
  return {
    ok: true,
    mode: 'fixed_one_pool',
    teams,
    drafts: buildDrafts(toMatchupOrder(teams), opts),
  };
}

// Single-pool seeder. Picks fixed-partners or rotating mode by inspecting
// the data unless the caller pins it via opts.mode.
export function seedSinglePoolPlayoffs(
  matches: StandingsMatch[],
  opts: PlayoffOptions = {},
): PlayoffSeedResult {
  const completed = matches.filter((m) => m.winner_side !== null);
  if (completed.length === 0) {
    return { ok: false, error: 'No completed matches to seed playoffs from.' };
  }

  const inferred: PlayoffSeedMode =
    opts.mode ?? (isRotatingPartnersData(completed) ? 'rotating' : 'fixed_one_pool');

  if (inferred === 'rotating') {
    const players = computePlayerStandings(completed);
    const teams = rotatingPartnerDraftTeams(players);
    if (!teams) {
      return {
        ok: false,
        error: 'Need at least 8 ranked players to draft playoff teams.',
      };
    }
    const seeded = teams as [string, string, string, string];
    return {
      ok: true,
      mode: 'rotating',
      teams: seeded,
      drafts: buildDrafts(toMatchupOrder(seeded), opts),
    };
  }

  const standings = computeStandings(completed);
  const teams = fixedPartnerOnePoolTeams(standings);
  if (!teams) {
    return {
      ok: false,
      error: 'Need at least 4 teams in the standings to seed playoffs.',
    };
  }
  const seeded = teams as [string, string, string, string];
  return {
    ok: true,
    mode: 'fixed_one_pool',
    teams: seeded,
    drafts: buildDrafts(toMatchupOrder(seeded), opts),
  };
}

// Raw seed order [1, 2, 3, 4] → matchup order [1, 4, 2, 3] (1v4, 2v3).
function toMatchupOrder(
  seeded: [string, string, string, string],
): [string, string, string, string] {
  return [seeded[0], seeded[3], seeded[1], seeded[2]];
}

// Two-pool seeder: caller already split matches by pool and passes them
// separately. Both pools must be fixed-partners with ≥2 teams ranked.
export function seedTwoPoolPlayoffs(
  poolAMatches: StandingsMatch[],
  poolBMatches: StandingsMatch[],
  opts: PlayoffOptions = {},
): PlayoffSeedResult {
  const standingsA = computeStandings(poolAMatches.filter((m) => m.winner_side !== null));
  const standingsB = computeStandings(poolBMatches.filter((m) => m.winner_side !== null));
  const teams = fixedPartnerTwoPoolTeams(standingsA, standingsB);
  if (!teams) {
    return {
      ok: false,
      error: 'Each pool needs at least 2 ranked teams for a crossover bracket.',
    };
  }
  const t = teams as [string, string, string, string];
  return { ok: true, mode: 'fixed_two_pools', teams: t, drafts: buildDrafts(t, opts) };
}

// Helper: given a scored semifinal, return the winner/loser labels to splice
// into the final and 3rd-place matches.
export function semiOutcomeLabels(
  team_a_label: string,
  team_b_label: string,
  winner_side: 'a' | 'b',
): { winner: string; loser: string } {
  return winner_side === 'a'
    ? { winner: team_a_label, loser: team_b_label }
    : { winner: team_b_label, loser: team_a_label };
}
