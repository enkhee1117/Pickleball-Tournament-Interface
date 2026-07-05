import { describe, expect, it } from 'vitest';
import type { CourtResult } from '@/lib/mixer-standings';
import { computeRecapStats, resultsToCsv } from './recap-stats';

const names = new Map([
  ['a', 'Alex Park'],
  ['b', 'Priya Shah'],
  ['c', 'Theo Kim'],
  ['d', 'Maya Chen'],
]);

// two rounds: team(a,b) wins both; team(c,d) loses both
function res(roundNo: number, scoreA: number, scoreB: number): CourtResult {
  return {
    key: `r${roundNo}:1:1`,
    roundId: `r${roundNo}`,
    roundNo,
    courtNo: 1,
    waveNo: 1,
    teamA: [{ id: 'a', name: 'Alex Park' }, { id: 'b', name: 'Priya Shah' }],
    teamB: [{ id: 'c', name: 'Theo Kim' }, { id: 'd', name: 'Maya Chen' }],
    scoreA,
    scoreB,
    completed: true,
    editable: false,
  };
}

describe('computeRecapStats', () => {
  const results = [res(1, 11, 4), res(2, 11, 9)];
  const stats = computeRecapStats(results, names, new Map([['a', 0], ['b', 1], ['c', 0], ['d', 2]]));

  it('counts completed matches and margins', () => {
    expect(stats.matches).toBe(2);
    expect(stats.closestMatch?.margin).toBe(2);
    expect(stats.avgMargin).toBe(4.5);
  });

  it('finds the longest win streak', () => {
    expect(stats.longestStreak).toMatchObject({ streak: 2 });
    expect(['a', 'b']).toContain(stats.longestStreak?.playerId);
  });

  it('picks an iron player with zero byes', () => {
    expect(stats.ironPlayer && stats.ironPlayer.detail).toContain('0 byes');
    expect(['a', 'c']).toContain(stats.ironPlayer?.playerId);
  });

  it('names the top scorer', () => {
    expect(stats.topScorer?.playerId).toBe('a');
  });
});

describe('resultsToCsv', () => {
  it('emits a header and one row per completed court', () => {
    const csv = resultsToCsv([res(1, 11, 4)], names);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('Round,Court,Team A,Team B,Score A,Score B,Winner');
    expect(lines[1]).toContain('Alex Park & Priya Shah');
    expect(lines[1]).toContain('11');
  });
});
