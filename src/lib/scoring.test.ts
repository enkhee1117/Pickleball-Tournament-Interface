import { describe, expect, it } from 'vitest';
import {
  computeMatchOutcome,
  computeStandings,
  isValidGame,
  type DivisionRules,
  type GameScore,
  type StandingsMatch,
} from '@/lib/scoring';

const rules11 = (best_of: 1 | 3 | 5 = 1): DivisionRules => ({
  best_of,
  target_score: 11,
  win_by: 2,
});
const rules15 = (): DivisionRules => ({ best_of: 1, target_score: 15, win_by: 2 });
const rulesWinBy1 = (): DivisionRules => ({ best_of: 1, target_score: 11, win_by: 1 });

describe('isValidGame', () => {
  it('passes 11-9 win-by-2', () => {
    expect(isValidGame([11, 9], rules11())).toBe(true);
  });
  it('rejects 11-10 because win-by-2 not satisfied', () => {
    expect(isValidGame([11, 10], rules11())).toBe(false);
  });
  it('passes 13-11 (two-point margin past 11)', () => {
    expect(isValidGame([13, 11], rules11())).toBe(true);
  });
  it('rejects 10-8 (target not reached)', () => {
    expect(isValidGame([10, 8], rules11())).toBe(false);
  });
  it('respects win_by=1', () => {
    expect(isValidGame([11, 10], rulesWinBy1())).toBe(true);
  });
  it('respects target=15', () => {
    expect(isValidGame([15, 13], rules15())).toBe(true);
    expect(isValidGame([11, 9], rules15())).toBe(false);
  });
});

describe('computeMatchOutcome', () => {
  it('best-of-1: returns winner after one valid game', () => {
    const o = computeMatchOutcome([[11, 7]], rules11(1));
    expect(o.winner).toBe('a');
    expect(o.gamesA).toBe(1);
    expect(o.gamesB).toBe(0);
    expect(o.pointsA).toBe(11);
    expect(o.pointsB).toBe(7);
  });
  it('best-of-3: needs 2 games to win', () => {
    const o1 = computeMatchOutcome(
      [
        [11, 5],
        [9, 11],
      ],
      rules11(3),
    );
    expect(o1.winner).toBeNull();
    expect(o1.gamesA).toBe(1);
    expect(o1.gamesB).toBe(1);
    const o2 = computeMatchOutcome(
      [
        [11, 5],
        [9, 11],
        [11, 8],
      ],
      rules11(3),
    );
    expect(o2.winner).toBe('a');
    expect(o2.gamesA).toBe(2);
    expect(o2.gamesB).toBe(1);
  });
  it('best-of-5: 3-0 sweep', () => {
    const o = computeMatchOutcome(
      [
        [11, 4],
        [11, 6],
        [11, 9],
      ],
      rules11(5),
    );
    expect(o.winner).toBe('a');
    expect(o.gamesA).toBe(3);
  });
  it('ignores invalid games when counting wins', () => {
    const o = computeMatchOutcome(
      [
        [10, 8], // invalid (target not reached)
        [11, 9],
      ],
      rules11(1),
    );
    expect(o.winner).toBe('a');
    expect(o.gamesA).toBe(1);
    expect(o.validGameCount).toBe(1);
    // points still counted across both games
    expect(o.pointsA).toBe(21);
    expect(o.pointsB).toBe(17);
  });
  it('reports null winner when no valid games yet', () => {
    const o = computeMatchOutcome([[7, 5]], rules11());
    expect(o.winner).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Standings
// ---------------------------------------------------------------------------

const m = (
  team_a_label: string,
  team_a_score: number,
  team_b_label: string,
  team_b_score: number,
  winner_side: 'a' | 'b' = team_a_score > team_b_score ? 'a' : 'b',
  games_won_a = winner_side === 'a' ? 1 : 0,
  games_won_b = winner_side === 'b' ? 1 : 0,
): StandingsMatch => ({
  id: `${team_a_label}-${team_b_label}-${team_a_score}-${team_b_score}`,
  team_a_label,
  team_b_label,
  winner_side,
  team_a_score,
  team_b_score,
  games_won_a,
  games_won_b,
});

describe('computeStandings', () => {
  it('orders by match wins first', () => {
    const standings = computeStandings([
      m('Alice & Bob', 11, 'Carol & Dave', 7),
      m('Alice & Bob', 11, 'Eve & Frank', 9),
      m('Carol & Dave', 11, 'Eve & Frank', 5),
    ]);
    expect(standings.map((s) => s.team)).toEqual([
      'Alice & Bob',
      'Carol & Dave',
      'Eve & Frank',
    ]);
    expect(standings[0].matchWins).toBe(2);
    expect(standings[0].matchLosses).toBe(0);
    expect(standings[1].matchWins).toBe(1);
    expect(standings[2].matchWins).toBe(0);
  });

  it('three-way tie at top falls through to point diff (cycles cancel out in H2H)', () => {
    // Three teams 1-1 each, each beat exactly one other. Wins-within-group
    // is identical (1 each), so we fall through to point differential.
    const standings = computeStandings([
      m('Red', 11, 'Blue', 9), // Red +2
      m('Blue', 11, 'Green', 4), // Blue +7
      m('Green', 11, 'Red', 8), // Green +3
    ]);
    expect(standings.every((s) => s.matchWins === 1)).toBe(true);
    // Point diff: Blue +5, Red -1, Green -4
    expect(standings.map((s) => s.team)).toEqual(['Blue', 'Red', 'Green']);
  });

  it('two-team tie at top: head-to-head wins out over point diff', () => {
    // Round-robin among 4: A and B both 2-1. A beat B head-to-head, but B
    // has a much better point diff. H2H within the tied group is decisive.
    const matches: StandingsMatch[] = [
      m('A', 11, 'B', 9), // A beat B by 2
      m('A', 11, 'C', 9),
      m('D', 11, 'A', 3), // D beat A by 8
      m('B', 11, 'D', 1), // B blowouts
      m('B', 11, 'C', 1),
      m('C', 11, 'D', 9),
    ];
    const standings = computeStandings(matches);
    // Records: A 2-1 (-4), B 2-1 (+18), C 1-2 (-10), D 1-2 (-4)
    // A and B tied at 2 wins → wins-in-group: A=1, B=0 → A first.
    // C and D tied at 1 win → wins-in-group: C=1 (beat D), D=0 → C first.
    expect(standings.map((s) => `${s.team}:${s.matchWins}`)).toEqual([
      'A:2',
      'B:2',
      'C:1',
      'D:1',
    ]);
    // Confirm H2H actually overrode point diff for the top two:
    expect(standings[0].pointDiff).toBeLessThan(standings[1].pointDiff);
  });

  it('falls back to alphabetical for absolute ties', () => {
    const standings = computeStandings([
      m('Bravo', 11, 'Alpha', 7),
      m('Alpha', 11, 'Bravo', 7),
    ]);
    // 1-1 each, point diff 0, games 1-1, head-to-head 1-1 — fully tied.
    expect(standings.map((s) => s.team)).toEqual(['Alpha', 'Bravo']);
  });

  it('skips uncompleted matches', () => {
    const standings = computeStandings([
      m('A', 11, 'B', 6),
      // pending match
      {
        id: 'p',
        team_a_label: 'A',
        team_b_label: 'C',
        winner_side: null,
        team_a_score: null,
        team_b_score: null,
        games_won_a: 0,
        games_won_b: 0,
      },
    ]);
    expect(standings.find((s) => s.team === 'A')?.matchesPlayed).toBe(1);
    expect(standings.find((s) => s.team === 'C')).toBeUndefined();
  });

  it('best-of-3 standings count games_won correctly', () => {
    const standings = computeStandings([
      // A beats B 2-1: games_won_a=2, games_won_b=1, points 11+9+11=31 vs 7+11+8=26
      {
        id: 'm',
        team_a_label: 'A',
        team_b_label: 'B',
        winner_side: 'a',
        team_a_score: 31,
        team_b_score: 26,
        games_won_a: 2,
        games_won_b: 1,
      },
    ]);
    const a = standings.find((s) => s.team === 'A')!;
    expect(a.gamesWon).toBe(2);
    expect(a.gamesLost).toBe(1);
    expect(a.pointDiff).toBe(5);
  });
});
