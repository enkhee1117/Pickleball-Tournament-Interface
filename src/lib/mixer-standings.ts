// Shared standings math for the mixer surfaces (score→standings, present).
// A court result is a doubles matchup (two teams of two). Points = total
// points a player's teams scored; wins/losses/point-diff are derived per
// completed court. Ranking matches the app's real metric (points), tie-broken
// by record then diff.

export interface CourtTeamPlayer {
  id: string;
  name: string;
}

export interface CourtResult {
  key: string; // `${roundId}:${courtNo}`
  roundId: string;
  roundNo: number;
  courtNo: number;
  teamA: CourtTeamPlayer[];
  teamB: CourtTeamPlayer[];
  scoreA: number;
  scoreB: number;
  completed: boolean;
  editable: boolean; // true only for the current round
}

export interface StandingRow {
  playerId: string;
  name: string;
  wins: number;
  losses: number;
  pointDiff: number;
  points: number;
}

export function computeStandings(results: CourtResult[], names: Map<string, string>): StandingRow[] {
  const acc = new Map<string, StandingRow>();
  const ensure = (p: CourtTeamPlayer): StandingRow => {
    let row = acc.get(p.id);
    if (!row) {
      row = { playerId: p.id, name: names.get(p.id) ?? p.name, wins: 0, losses: 0, pointDiff: 0, points: 0 };
      acc.set(p.id, row);
    }
    return row;
  };

  for (const r of results) {
    if (!r.completed) continue;
    const aWin = r.scoreA > r.scoreB;
    const bWin = r.scoreB > r.scoreA;
    for (const p of r.teamA) {
      const row = ensure(p);
      row.points += r.scoreA;
      row.pointDiff += r.scoreA - r.scoreB;
      if (aWin) row.wins++;
      else if (bWin) row.losses++;
    }
    for (const p of r.teamB) {
      const row = ensure(p);
      row.points += r.scoreB;
      row.pointDiff += r.scoreB - r.scoreA;
      if (bWin) row.wins++;
      else if (aWin) row.losses++;
    }
  }

  return sortStandings([...acc.values()]);
}

export function sortStandings(rows: StandingRow[]): StandingRow[] {
  return [...rows].sort(
    (a, b) =>
      b.points - a.points ||
      b.wins - b.losses - (a.wins - a.losses) ||
      b.pointDiff - a.pointDiff ||
      a.name.localeCompare(b.name),
  );
}

// Build court results (doubles matchups) from raw pairing + score rows. A court
// only becomes a matchup once it has two teams (two pairing rows).
export function buildCourtResults(
  pairings: { round_id: string; player_a_id: string; player_b_id: string; court_no: number }[],
  scores: { round_id: string; court_no: number; team_a_score: number; team_b_score: number; completed_at: string | null }[],
  roundNoById: Map<string, number>,
  currentRoundId: string | null,
  nameOf: (id: string) => string,
): CourtResult[] {
  const byCourt = new Map<string, typeof pairings>();
  for (const p of pairings) {
    const key = `${p.round_id}:${p.court_no}`;
    byCourt.set(key, [...(byCourt.get(key) ?? []), p]);
  }
  const results: CourtResult[] = [];
  for (const [key, teams] of byCourt) {
    if (teams.length < 2) continue;
    const [teamA, teamB] = teams;
    const roundId = teamA.round_id;
    const courtNo = teamA.court_no;
    const score = scores.find((s) => s.round_id === roundId && s.court_no === courtNo);
    results.push({
      key,
      roundId,
      roundNo: roundNoById.get(roundId) ?? 0,
      courtNo,
      teamA: [
        { id: teamA.player_a_id, name: nameOf(teamA.player_a_id) },
        { id: teamA.player_b_id, name: nameOf(teamA.player_b_id) },
      ],
      teamB: [
        { id: teamB.player_a_id, name: nameOf(teamB.player_a_id) },
        { id: teamB.player_b_id, name: nameOf(teamB.player_b_id) },
      ],
      scoreA: score?.team_a_score ?? 0,
      scoreB: score?.team_b_score ?? 0,
      completed: !!score?.completed_at,
      editable: currentRoundId != null && roundId === currentRoundId,
    });
  }
  results.sort((a, b) => a.roundNo - b.roundNo || a.courtNo - b.courtNo);
  return results;
}

// Standings using only results up to and including maxRoundNo.
export function standingsThroughRound(
  results: CourtResult[],
  names: Map<string, string>,
  maxRoundNo: number,
): StandingRow[] {
  return computeStandings(results.filter((r) => r.roundNo <= maxRoundNo), names);
}

// The latest round number with any completed court.
export function latestScoredRound(results: CourtResult[]): number {
  return results.reduce((max, r) => (r.completed ? Math.max(max, r.roundNo) : max), 0);
}

// Places moved between the standings through (round-1) and through round.
// Positive = climbed. Keyed by playerId.
export function climbDeltas(results: CourtResult[], names: Map<string, string>, round: number): Map<string, number> {
  const prev = standingsThroughRound(results, names, round - 1).map((r) => r.playerId);
  const now = standingsThroughRound(results, names, round);
  const deltas = new Map<string, number>();
  now.forEach((row, i) => {
    const was = prev.indexOf(row.playerId);
    deltas.set(row.playerId, was < 0 ? 0 : was - i);
  });
  return deltas;
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
