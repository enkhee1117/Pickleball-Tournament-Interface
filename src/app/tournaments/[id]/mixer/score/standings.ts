// Shared standings math for the score→standings surface. A court result is a
// doubles matchup (two teams of two). Points = total points a player's teams
// scored; wins/losses/point-diff are derived per completed court. Ranking
// matches the app's real metric (points), tie-broken by record then diff.

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

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
