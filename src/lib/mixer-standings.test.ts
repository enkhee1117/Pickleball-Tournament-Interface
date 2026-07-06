import { describe, expect, it } from 'vitest';
import {
  buildCourtResults,
  computeStandings,
  gameSlotLabel,
  ordinal,
  playerGamesMap,
  sortStandings,
  tallyGames,
  type CourtResult,
} from './mixer-standings';

const names = new Map([
  ['me', 'Maya Chen'],
  ['p6', 'Eli Brooks'],
  ['p11', 'Lila Novak'],
  ['p4', 'Alex Park'],
]);

function court(scoreA: number, scoreB: number, completed = true): CourtResult {
  return {
    key: `r1:1:1`,
    roundId: 'r1',
    roundNo: 1,
    courtNo: 1,
    waveNo: 1,
    teamA: [
      { id: 'me', name: 'Maya Chen' },
      { id: 'p6', name: 'Eli Brooks' },
    ],
    teamB: [
      { id: 'p11', name: 'Lila Novak' },
      { id: 'p4', name: 'Alex Park' },
    ],
    scoreA,
    scoreB,
    completed,
    editable: true,
  };
}

describe('computeStandings', () => {
  it('ignores uncompleted courts', () => {
    expect(computeStandings([court(11, 7, false)], names)).toHaveLength(0);
  });

  it('accumulates points, record and point-diff for both teams', () => {
    const rows = computeStandings([court(11, 7)], names);
    const maya = rows.find((r) => r.playerId === 'me')!;
    const lila = rows.find((r) => r.playerId === 'p11')!;
    expect(maya).toMatchObject({ points: 11, wins: 1, losses: 0, pointDiff: 4 });
    expect(lila).toMatchObject({ points: 7, wins: 0, losses: 1, pointDiff: -4 });
  });

  it('ranks winners above losers', () => {
    const rows = computeStandings([court(11, 7)], names);
    expect(rows[0].playerId === 'me' || rows[0].playerId === 'p6').toBe(true);
    expect(rows[rows.length - 1].points).toBe(7);
  });
});

describe('sortStandings', () => {
  it('orders by points, then record, then point-diff', () => {
    const rows = sortStandings([
      { playerId: 'a', name: 'A', wins: 1, losses: 1, pointDiff: 0, points: 20 },
      { playerId: 'b', name: 'B', wins: 2, losses: 0, pointDiff: 8, points: 22 },
      { playerId: 'c', name: 'C', wins: 2, losses: 0, pointDiff: 3, points: 22 },
    ]);
    expect(rows.map((r) => r.playerId)).toEqual(['b', 'c', 'a']);
  });
});

describe('buildCourtResults with waves', () => {
  // Two games share court 1 across two waves (heats) — the exact "more games
  // than courts" case. Grouping must keep them as two distinct matchups, not
  // fuse the four teams into one, and each wave scores independently.
  const pairings = [
    { round_id: 'r1', player_a_id: 'a1', player_b_id: 'b1', court_no: 1, wave_no: 1 },
    { round_id: 'r1', player_a_id: 'a2', player_b_id: 'b2', court_no: 1, wave_no: 1 },
    { round_id: 'r1', player_a_id: 'a3', player_b_id: 'b3', court_no: 1, wave_no: 2 },
    { round_id: 'r1', player_a_id: 'a4', player_b_id: 'b4', court_no: 1, wave_no: 2 },
  ];
  const scores = [
    { round_id: 'r1', court_no: 1, wave_no: 1, team_a_score: 11, team_b_score: 5, completed_at: 't' },
    { round_id: 'r1', court_no: 1, wave_no: 2, team_a_score: 9, team_b_score: 11, completed_at: 't' },
  ];
  const results = buildCourtResults(pairings, scores, new Map([['r1', 1]]), 'r1', (id) => id);

  it('splits one court into a game per wave', () => {
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.waveNo)).toEqual([1, 2]);
  });

  it('scores each wave independently', () => {
    const wave1 = results.find((r) => r.waveNo === 1)!;
    const wave2 = results.find((r) => r.waveNo === 2)!;
    expect([wave1.scoreA, wave1.scoreB]).toEqual([11, 5]);
    expect([wave2.scoreA, wave2.scoreB]).toEqual([9, 11]);
  });

  it('attributes points to all four teams, not just the first game', () => {
    const rows = computeStandings(results, new Map());
    // 8 players total across the two games — none dropped.
    expect(rows).toHaveLength(8);
    // Wave 2: team (a3,b3) scored 9 and lost; team (a4,b4) scored 11 and won.
    expect(rows.find((r) => r.playerId === 'a3')).toMatchObject({ points: 9, wins: 0, losses: 1 });
    expect(rows.find((r) => r.playerId === 'b4')).toMatchObject({ points: 11, wins: 1, losses: 0 });
  });
});

describe('tallyGames', () => {
  // Three games: one final, one live (current round, no score), one upcoming
  // (future round, not editable). Final counts once; live counts once; both
  // unfinished count toward "left".
  const mk = (over: Partial<CourtResult>): CourtResult => ({ ...court(0, 0, false), ...over });
  const results = [
    mk({ key: 'a', completed: true, editable: true }),
    mk({ key: 'b', completed: false, editable: true }),
    mk({ key: 'c', completed: false, editable: false }),
  ];

  it('counts final, live and left', () => {
    expect(tallyGames(results)).toEqual({ total: 3, fin: 1, live: 1, left: 2 });
  });

  it('is all-zero-ish on an empty board', () => {
    expect(tallyGames([])).toEqual({ total: 0, fin: 0, live: 0, left: 0 });
  });
});

describe('playerGamesMap', () => {
  const mk = (over: Partial<CourtResult>): CourtResult => ({ ...court(0, 0, false), ...over });
  // Maya (id 'me') plays two games: one completed, one live.
  const results = [
    mk({ key: 'a', completed: true, editable: false }),
    mk({ key: 'b', completed: false, editable: true }),
  ];
  const map = playerGamesMap(results);

  it('counts scheduled and played, and flags on-court', () => {
    expect(map.get('me')).toEqual({ played: 1, scheduled: 2, onCourt: true });
  });

  it('does not flag on-court when the live game is already final', () => {
    const done = playerGamesMap([mk({ completed: true, editable: true })]);
    expect(done.get('me')).toEqual({ played: 1, scheduled: 1, onCourt: false });
  });
});

describe('buildCourtResults team ordering', () => {
  // Team A (owns team_a_score) must be settled by (created_at, id) — the same
  // key the finalize RPC uses — NOT by the query's row order. Otherwise the
  // live board and the finalized snapshot attribute a game's scores to opposite
  // teams and rank players differently. Rows here arrive newest-first to prove
  // the function re-sorts them.
  const pairings = [
    { id: 'z', created_at: '2026-01-01T00:00:02Z', round_id: 'r1', player_a_id: 'late1', player_b_id: 'late2', court_no: 1, wave_no: 1 },
    { id: 'a', created_at: '2026-01-01T00:00:01Z', round_id: 'r1', player_a_id: 'early1', player_b_id: 'early2', court_no: 1, wave_no: 1 },
  ];
  const scores = [{ round_id: 'r1', court_no: 1, wave_no: 1, team_a_score: 11, team_b_score: 4, completed_at: 't' }];

  it('makes the earliest-created pairing team A regardless of row order', () => {
    const [game] = buildCourtResults(pairings, scores, new Map([['r1', 1]]), 'r1', (id) => id);
    expect(game.teamA.map((p) => p.id)).toEqual(['early1', 'early2']);
    expect(game.scoreA).toBe(11);
  });

  it('attributes team_a_score to the early team in standings', () => {
    const rows = computeStandings(buildCourtResults(pairings, scores, new Map([['r1', 1]]), 'r1', (id) => id), new Map());
    expect(rows.find((r) => r.playerId === 'early1')!.points).toBe(11);
    expect(rows.find((r) => r.playerId === 'late1')!.points).toBe(4);
  });
});

describe('gameSlotLabel', () => {
  it('omits the heat qualifier for wave 1 and shows it beyond', () => {
    expect(gameSlotLabel(2, 1)).toBe('Court 2');
    expect(gameSlotLabel(1, 2)).toBe('Court 1 · Heat 2');
  });
});

describe('ordinal', () => {
  it('formats ranks', () => {
    expect([1, 2, 3, 4, 11, 21].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '21st']);
  });
});
