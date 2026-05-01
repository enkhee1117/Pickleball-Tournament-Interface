// Pure scoring + standings logic.
//
// Pickleball convention: a match is best-of-N games (typically 1, 3 or 5).
// A game is won at target_score (11/15/21) by win_by (typically 2). The match
// is won by the team that wins more than half the games. Tournament tiebreakers
// in order:
//   1. Match wins (most -> least)
//   2. Head-to-head wins among teams tied on match wins
//   3. Game-point differential (sum of pointsFor - pointsAgainst across games)
//   4. Games won
// Falls back to alphabetical for full ties so the order stays stable.

export type GameScore = readonly [a: number, b: number];

export type DivisionRules = {
  best_of: 1 | 3 | 5;
  target_score: 11 | 15 | 21;
  win_by: 1 | 2;
};

export const DEFAULT_RULES: DivisionRules = {
  best_of: 1,
  target_score: 11,
  win_by: 2,
};

export type MatchOutcome = {
  // 'a' | 'b' | null — null when match isn't decided yet
  winner: 'a' | 'b' | null;
  gamesA: number;
  gamesB: number;
  pointsA: number;
  pointsB: number;
  // Indices of games that are valid (target reached + win-by satisfied).
  validGameCount: number;
};

export function computeMatchOutcome(games: GameScore[], rules: DivisionRules): MatchOutcome {
  let gamesA = 0;
  let gamesB = 0;
  let pointsA = 0;
  let pointsB = 0;
  let validGameCount = 0;

  for (const [a, b] of games) {
    pointsA += a;
    pointsB += b;
    if (
      (a >= rules.target_score || b >= rules.target_score) &&
      Math.abs(a - b) >= rules.win_by
    ) {
      validGameCount += 1;
      if (a > b) gamesA += 1;
      else gamesB += 1;
    }
  }

  const need = Math.floor(rules.best_of / 2) + 1;
  let winner: 'a' | 'b' | null = null;
  if (gamesA >= need) winner = 'a';
  else if (gamesB >= need) winner = 'b';

  return { winner, gamesA, gamesB, pointsA, pointsB, validGameCount };
}

export function isValidGame(score: GameScore, rules: DivisionRules): boolean {
  const [a, b] = score;
  return (
    (a >= rules.target_score || b >= rules.target_score) &&
    Math.abs(a - b) >= rules.win_by
  );
}

// ---------------------------------------------------------------------------
// Standings.
// ---------------------------------------------------------------------------

export type StandingsMatch = {
  id: string;
  team_a_label: string;
  team_b_label: string;
  winner_side: 'a' | 'b' | null;
  // Aggregate points across games (already summed by the DB or by us before).
  team_a_score: number | null;
  team_b_score: number | null;
  games_won_a: number;
  games_won_b: number;
};

export type StandingRow = {
  team: string;
  matchesPlayed: number;
  matchWins: number;
  matchLosses: number;
  winPct: number;
  pointDiff: number;
  pointsFor: number;
  pointsAgainst: number;
  gamesWon: number;
  gamesLost: number;
};

export function computeStandings(matches: StandingsMatch[]): StandingRow[] {
  const rows = new Map<string, StandingRow>();

  const ensure = (team: string): StandingRow => {
    let row = rows.get(team);
    if (!row) {
      row = {
        team,
        matchesPlayed: 0,
        matchWins: 0,
        matchLosses: 0,
        winPct: 0,
        pointDiff: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        gamesWon: 0,
        gamesLost: 0,
      };
      rows.set(team, row);
    }
    return row;
  };

  for (const m of matches) {
    if (m.winner_side === null) continue;
    const a = ensure(m.team_a_label);
    const b = ensure(m.team_b_label);
    a.matchesPlayed += 1;
    b.matchesPlayed += 1;
    a.pointsFor += m.team_a_score ?? 0;
    a.pointsAgainst += m.team_b_score ?? 0;
    b.pointsFor += m.team_b_score ?? 0;
    b.pointsAgainst += m.team_a_score ?? 0;
    a.gamesWon += m.games_won_a;
    a.gamesLost += m.games_won_b;
    b.gamesWon += m.games_won_b;
    b.gamesLost += m.games_won_a;
    if (m.winner_side === 'a') {
      a.matchWins += 1;
      b.matchLosses += 1;
    } else {
      b.matchWins += 1;
      a.matchLosses += 1;
    }
  }

  for (const row of rows.values()) {
    row.pointDiff = row.pointsFor - row.pointsAgainst;
    row.winPct = row.matchesPlayed === 0 ? 0 : row.matchWins / row.matchesPlayed;
  }

  // Stage 1: sort by match wins.
  const all = Array.from(rows.values()).sort((x, y) => y.matchWins - x.matchWins);

  // Stage 2: within each group tied on match wins, compute wins against other
  // members of that group ("head-to-head"), then point diff, then games won,
  // then alphabetical. This avoids cyclic three-way ties because each row is
  // assigned a single transitively comparable head-to-head count.
  const result: StandingRow[] = [];
  let i = 0;
  while (i < all.length) {
    let j = i + 1;
    while (j < all.length && all[j].matchWins === all[i].matchWins) j += 1;
    const group = all.slice(i, j);
    sortTiedGroup(group, matches);
    result.push(...group);
    i = j;
  }
  return result;
}

function sortTiedGroup(group: StandingRow[], allMatches: StandingsMatch[]) {
  if (group.length <= 1) return;
  const groupSet = new Set(group.map((r) => r.team));
  const winsInGroup = new Map<string, number>();
  for (const m of allMatches) {
    if (m.winner_side === null) continue;
    const winner = m.winner_side === 'a' ? m.team_a_label : m.team_b_label;
    const loser = m.winner_side === 'a' ? m.team_b_label : m.team_a_label;
    if (groupSet.has(winner) && groupSet.has(loser)) {
      winsInGroup.set(winner, (winsInGroup.get(winner) ?? 0) + 1);
    }
  }
  group.sort((x, y) => {
    const xw = winsInGroup.get(x.team) ?? 0;
    const yw = winsInGroup.get(y.team) ?? 0;
    if (xw !== yw) return yw - xw;
    if (x.pointDiff !== y.pointDiff) return y.pointDiff - x.pointDiff;
    if (x.gamesWon !== y.gamesWon) return y.gamesWon - x.gamesWon;
    return x.team.localeCompare(y.team);
  });
}
