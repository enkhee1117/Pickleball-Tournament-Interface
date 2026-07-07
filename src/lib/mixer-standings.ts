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
  key: string; // `${roundId}:${courtNo}:${waveNo}`
  roundId: string;
  roundNo: number;
  courtNo: number;
  waveNo: number;
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

// A game is "live" (on a court right now) when it belongs to the current
// round (editable) and has no final score yet. "Final" games are completed.
export interface GameTally {
  total: number;
  fin: number;
  live: number;
  left: number; // total - fin
}

export function tallyGames(results: CourtResult[]): GameTally {
  let fin = 0;
  let live = 0;
  for (const r of results) {
    if (r.completed) fin++;
    else if (r.editable) live++;
  }
  const total = results.length;
  return { total, fin, live, left: total - fin };
}

// Per-player game counts for the standings "Games" dots. `scheduled` is every
// game the player is drawn into (played or not); `played` is the completed
// ones; `onCourt` is true while they're in a live (current-round) game.
export interface PlayerGames {
  played: number;
  scheduled: number;
  onCourt: boolean;
}

export function playerGamesMap(results: CourtResult[]): Map<string, PlayerGames> {
  const map = new Map<string, PlayerGames>();
  const ensure = (id: string): PlayerGames => {
    let g = map.get(id);
    if (!g) {
      g = { played: 0, scheduled: 0, onCourt: false };
      map.set(id, g);
    }
    return g;
  };
  for (const r of results) {
    const live = r.editable && !r.completed;
    for (const p of [...r.teamA, ...r.teamB]) {
      const g = ensure(p.id);
      g.scheduled++;
      if (r.completed) g.played++;
      if (live) g.onCourt = true;
    }
  }
  return map;
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

// Build court results (doubles matchups) from raw pairing + score rows. A game
// only becomes a matchup once it has two teams (two pairing rows). Games are
// keyed by (round, court, wave): when games outnumber courts a court runs
// several games in waves, so grouping by court alone would fuse distinct games.
export function buildCourtResults(
  pairings: { id?: string; created_at?: string | null; round_id: string; player_a_id: string; player_b_id: string; court_no: number; wave_no?: number }[],
  scores: { round_id: string; court_no: number; wave_no?: number; team_a_score: number; team_b_score: number; completed_at: string | null }[],
  roundNoById: Map<string, number>,
  currentRoundId: string | null,
  nameOf: (id: string) => string,
): CourtResult[] {
  const byGame = new Map<string, typeof pairings>();
  for (const p of pairings) {
    const key = `${p.round_id}:${p.court_no}:${p.wave_no ?? 1}`;
    byGame.set(key, [...(byGame.get(key) ?? []), p]);
  }
  const results: CourtResult[] = [];
  for (const [key, teams] of byGame) {
    if (teams.length < 2) continue;
    // Which pairing row is "team A" (owns team_a_score) must NOT depend on the
    // query's row order — the finalize RPC settles it by (created_at, id), and
    // if the client disagrees, the same game's scores get attributed to the
    // opposite teams, so the live board and the finalized snapshot rank players
    // differently. Sort by the SAME key the RPC uses so every surface agrees.
    const ordered = [...teams].sort(
      (a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? '') || (a.id ?? '').localeCompare(b.id ?? ''),
    );
    const [teamA, teamB] = ordered;
    const roundId = teamA.round_id;
    const courtNo = teamA.court_no;
    const waveNo = teamA.wave_no ?? 1;
    const score = scores.find(
      (s) => s.round_id === roundId && s.court_no === courtNo && (s.wave_no ?? 1) === waveNo,
    );
    results.push({
      key,
      roundId,
      roundNo: roundNoById.get(roundId) ?? 0,
      courtNo,
      waveNo,
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
  results.sort((a, b) => a.roundNo - b.roundNo || a.courtNo - b.courtNo || a.waveNo - b.waveNo);
  return results;
}

// Human label for a game slot. Courts are physical; waves (heats) are the
// sequence a court runs when there are more games than courts. Wave 1 is the
// first game on that court, so it needs no qualifier.
export function gameSlotLabel(courtNo: number, waveNo: number): string {
  return waveNo > 1 ? `Court ${courtNo} · Heat ${waveNo}` : `Court ${courtNo}`;
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

// Places each id moved between two orderings (score-flow.html row `mv`):
// positive = climbed toward the top, negative = dropped. Only ids present in
// both orderings at a different index are returned. Used by the live board to
// show ▲/▼ deltas when a posted score re-sorts the standings.
export function orderMovements(prevOrder: string[], curOrder: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  curOrder.forEach((id, i) => {
    const was = prevOrder.indexOf(id);
    if (was >= 0 && was !== i) out[id] = was - i;
  });
  return out;
}
