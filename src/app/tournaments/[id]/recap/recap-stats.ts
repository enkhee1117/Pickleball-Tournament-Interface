// Derived recap statistics computed from real mixer results. Pure so it can be
// unit-tested and reused. Everything here comes from completed court scores +
// per-player sit-out counts — no fabricated numbers.

import {
  computeStandings,
  standingsThroughRound,
  type CourtResult,
  type StandingRow,
} from '@/lib/mixer-standings';

export interface Superlative {
  playerId: string;
  name: string;
  detail: string;
}

export interface RecapStats {
  standings: StandingRow[];
  matches: number;
  closestMatch: { margin: number; scoreA: number; scoreB: number; courtNo: number; roundNo: number } | null;
  avgMargin: number | null;
  longestStreak: { playerId: string; name: string; streak: number } | null;
  biggestClimber: Superlative | null;
  ironPlayer: Superlative | null;
  topScorer: Superlative | null;
}

const firstName = (n: string) => n.split(' ')[0];

export function computeRecapStats(
  results: CourtResult[],
  names: Map<string, string>,
  sitOuts: Map<string, number>,
): RecapStats {
  const completed = results.filter((r) => r.completed).sort((a, b) => a.roundNo - b.roundNo || a.courtNo - b.courtNo);
  const standings = computeStandings(results, names);

  const margins = completed.map((r) => Math.abs(r.scoreA - r.scoreB));
  const avgMargin = margins.length ? Math.round((margins.reduce((s, m) => s + m, 0) / margins.length) * 10) / 10 : null;

  let closestMatch: RecapStats['closestMatch'] = null;
  for (const r of completed) {
    const margin = Math.abs(r.scoreA - r.scoreB);
    if (!closestMatch || margin < closestMatch.margin) {
      closestMatch = { margin, scoreA: r.scoreA, scoreB: r.scoreB, courtNo: r.courtNo, roundNo: r.roundNo };
    }
  }

  // Longest win streak — walk each player's matches in round order.
  const streaks = new Map<string, { cur: number; max: number; games: number }>();
  const bump = (id: string, won: boolean) => {
    const s = streaks.get(id) ?? { cur: 0, max: 0, games: 0 };
    s.games += 1;
    s.cur = won ? s.cur + 1 : 0;
    s.max = Math.max(s.max, s.cur);
    streaks.set(id, s);
  };
  for (const r of completed) {
    const aWin = r.scoreA > r.scoreB;
    const bWin = r.scoreB > r.scoreA;
    for (const p of r.teamA) bump(p.id, aWin);
    for (const p of r.teamB) bump(p.id, bWin);
  }
  let longestStreak: RecapStats['longestStreak'] = null;
  for (const [id, s] of streaks) {
    if (s.max >= 2 && (!longestStreak || s.max > longestStreak.streak)) {
      longestStreak = { playerId: id, name: names.get(id) ?? 'Player', streak: s.max };
    }
  }

  // Biggest climber — places gained from the round-1 board to the final board.
  const earlyOrder = standingsThroughRound(results, names, 1).map((r) => r.playerId);
  let biggestClimber: Superlative | null = null;
  let bestGain = 0;
  standings.forEach((row, finalIdx) => {
    const was = earlyOrder.indexOf(row.playerId);
    if (was < 0) return;
    const gain = was - finalIdx;
    if (gain > bestGain) {
      bestGain = gain;
      biggestClimber = { playerId: row.playerId, name: row.name, detail: `+${gain} place${gain === 1 ? '' : 's'}` };
    }
  });

  // Iron player — no byes, most games played.
  let ironPlayer: Superlative | null = null;
  let ironGames = -1;
  for (const [id, s] of streaks) {
    if ((sitOuts.get(id) ?? 0) === 0 && s.games > ironGames) {
      ironGames = s.games;
      ironPlayer = { playerId: id, name: names.get(id) ?? 'Player', detail: `${s.games} games · 0 byes` };
    }
  }

  const topScorer: Superlative | null = standings[0]
    ? { playerId: standings[0].playerId, name: standings[0].name, detail: `${standings[0].points} points · ${standings[0].wins}–${standings[0].losses}` }
    : null;

  return {
    standings,
    matches: completed.length,
    closestMatch,
    avgMargin,
    longestStreak,
    biggestClimber,
    ironPlayer,
    topScorer,
  };
}

export function resultsToCsv(results: CourtResult[], names: Map<string, string>): string {
  const nameOf = (id: string) => names.get(id) ?? id;
  const rows = [['Round', 'Court', 'Team A', 'Team B', 'Score A', 'Score B', 'Winner']];
  for (const r of results.filter((x) => x.completed).sort((a, b) => a.roundNo - b.roundNo || a.courtNo - b.courtNo)) {
    const teamA = r.teamA.map((p) => nameOf(p.id)).join(' & ');
    const teamB = r.teamB.map((p) => nameOf(p.id)).join(' & ');
    const winner = r.scoreA > r.scoreB ? teamA : r.scoreB > r.scoreA ? teamB : 'Tie';
    rows.push([String(r.roundNo), String(r.courtNo), teamA, teamB, String(r.scoreA), String(r.scoreB), winner]);
  }
  return rows.map((cols) => cols.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\n');
}

export { firstName };
