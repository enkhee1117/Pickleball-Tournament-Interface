import { describe, expect, it } from 'vitest';
import { computeStandings, ordinal, sortStandings, type CourtResult } from './standings';

const names = new Map([
  ['me', 'Maya Chen'],
  ['p6', 'Eli Brooks'],
  ['p11', 'Lila Novak'],
  ['p4', 'Alex Park'],
]);

function court(scoreA: number, scoreB: number, completed = true): CourtResult {
  return {
    key: `r1:1`,
    roundId: 'r1',
    roundNo: 1,
    courtNo: 1,
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

describe('ordinal', () => {
  it('formats ranks', () => {
    expect([1, 2, 3, 4, 11, 21].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '21st']);
  });
});
