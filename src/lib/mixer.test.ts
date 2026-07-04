import { describe, expect, it } from 'vitest';
import {
  MIXER_UPVOTE_CAP_PER_TARGET,
  eligibleBallotTargets,
  computeRaffleTickets,
  drawMixerPairs,
  isUpvoteAllocationValid,
  mixerPairScore,
  mixerPairWeight,
  settleParimutuelBets,
  type MixerPlayer,
  type MixerVote,
} from '@/lib/mixer';
import { currentMixerRound, sortMixerRounds } from '@/lib/mixer-rounds';

describe('mixerPairWeight', () => {
  it('matches the handoff sanity check weights', () => {
    const votes: MixerVote[] = [
      { voterPlayerId: 'Al', targetPlayerId: 'Di', upTokens: 2, downTokens: 0 },
      { voterPlayerId: 'Di', targetPlayerId: 'Al', upTokens: 1, downTokens: 0 },
      { voterPlayerId: 'Bo', targetPlayerId: 'Di', upTokens: 3, downTokens: 0 },
      { voterPlayerId: 'Cy', targetPlayerId: 'Ev', upTokens: 0, downTokens: 2 },
    ];

    expect(mixerPairWeight('Al', 'Di', votes)).toBeCloseTo(26.3, 1);
    expect(mixerPairWeight('Bo', 'Di', votes)).toBeCloseTo(4.5, 1);
    expect(mixerPairWeight('Cy', 'Ev', votes)).toBeCloseTo(0.37, 2);
    expect(mixerPairWeight('Al', 'Ev', votes)).toBeCloseTo(1, 5);
  });

  it('applies repeat decay per previous partnership', () => {
    expect(mixerPairWeight('A', 'B', [], { 'A:B': 1 })).toBeCloseTo(0.2, 5);
    expect(mixerPairWeight('A', 'B', [], { 'A:B': 2 })).toBeCloseTo(0.04, 5);
  });
});

describe('drawMixerPairs', () => {
  it('sits surplus-pool players with the lowest sit-out count first', () => {
    const players: MixerPlayer[] = [
      { id: 'a1', name: 'A1', pool: 'a', sitOutCount: 1 },
      { id: 'a2', name: 'A2', pool: 'a', sitOutCount: 0 },
      { id: 'a3', name: 'A3', pool: 'a', sitOutCount: 2 },
      { id: 'b1', name: 'B1', pool: 'b', sitOutCount: 0 },
      { id: 'b2', name: 'B2', pool: 'b', sitOutCount: 0 },
    ];

    const result = drawMixerPairs({ players, votes: [], rng: () => 0.99 });
    expect(result.sitOuts).toEqual(['a2']);
    expect(result.pairs).toHaveLength(2);
  });

  it('avoids a last-round sitter before players with equal counts', () => {
    const players: MixerPlayer[] = [
      { id: 'a1', name: 'A1', pool: 'a', sitOutCount: 0, satLastRound: true },
      { id: 'a2', name: 'A2', pool: 'a', sitOutCount: 0, satLastRound: false },
      { id: 'a3', name: 'A3', pool: 'a', sitOutCount: 1, satLastRound: false },
      { id: 'b1', name: 'B1', pool: 'b' },
      { id: 'b2', name: 'B2', pool: 'b' },
    ];

    const result = drawMixerPairs({ players, votes: [], rng: () => 0.99 });
    expect(result.sitOuts).toEqual(['a2']);
  });
});

describe('computeRaffleTickets', () => {
  it('caps popularity per upvoter and ignores bought-token leftovers', () => {
    const tickets = computeRaffleTickets({
      votes: [
        { voterPlayerId: 'a', targetPlayerId: 'me', upTokens: 9, downTokens: 0 },
        { voterPlayerId: 'b', targetPlayerId: 'me', upTokens: 2, downTokens: 0 },
      ],
      states: [{ playerId: 'me', baseTokensRemaining: 4, boughtTokensRemaining: 10 }],
    });

    expect(tickets[0]).toEqual({
      playerId: 'me',
      popularityTickets: 5,
      frugalityTickets: 2,
      tickets: 7,
    });
  });
});

describe('settleParimutuelBets', () => {
  it('splits each market pot proportionally among correct backers', () => {
    const payouts = settleParimutuelBets({
      bets: [
        { marketPlace: 1, bettorPlayerId: 'a', pickPlayerId: 'winner', chips: 20 },
        { marketPlace: 1, bettorPlayerId: 'b', pickPlayerId: 'winner', chips: 30 },
        { marketPlace: 1, bettorPlayerId: 'c', pickPlayerId: 'other', chips: 50 },
      ],
      winnersByPlace: { 1: 'winner' },
    });

    expect(payouts).toEqual([
      { bettorPlayerId: 'a', marketPlace: 1, payout: 40 },
      { bettorPlayerId: 'b', marketPlace: 1, payout: 60 },
    ]);
  });
});

describe('mixer formula edge cases', () => {
  it('clamps a one-sided downvote spree at the grief floor', () => {
    // Far below -griefFloor of -4: γ·(d) = -20 would tank weight. The floor
    // pins the score at -4, so weight = exp(-4/2) ≈ 0.135 — exactly the
    // "anti-grief" floor the design specifies.
    const votes: MixerVote[] = [
      { voterPlayerId: 'a', targetPlayerId: 'b', upTokens: 0, downTokens: 20 },
    ];
    expect(mixerPairScore('a', 'b', votes)).toBeCloseTo(-4, 5);
    expect(mixerPairWeight('a', 'b', votes)).toBeCloseTo(Math.exp(-2), 5);
  });

  it('does not divide by zero when tau is misconfigured', () => {
    const weight = mixerPairWeight('a', 'b', [], {}, {
      alpha: 1, beta: 2.5, gamma: 1, tau: 0, griefFloor: 4, repeatDecay: 0.2,
    });
    expect(Number.isFinite(weight)).toBe(true);
  });
});

describe('upvote allocation validator', () => {
  it('rejects more than the per-target cap of 3', () => {
    expect(isUpvoteAllocationValid(0)).toBe(true);
    expect(isUpvoteAllocationValid(3)).toBe(true);
    expect(isUpvoteAllocationValid(4)).toBe(false);
    expect(isUpvoteAllocationValid(-1)).toBe(false);
    expect(isUpvoteAllocationValid(Number.NaN)).toBe(false);
    expect(MIXER_UPVOTE_CAP_PER_TARGET).toBe(3);
  });
});

describe('computeRaffleTickets edge cases', () => {
  it('returns zero tickets when nobody upvoted you and you spent everything', () => {
    const tickets = computeRaffleTickets({
      votes: [],
      states: [{ playerId: 'me', baseTokensRemaining: 0 }],
    });
    expect(tickets[0]).toEqual({
      playerId: 'me',
      popularityTickets: 0,
      frugalityTickets: 0,
      tickets: 0,
    });
  });
});

describe('settleParimutuelBets edge cases', () => {
  it('returns no payouts when nobody backed the winner', () => {
    const payouts = settleParimutuelBets({
      bets: [
        { marketPlace: 1, bettorPlayerId: 'a', pickPlayerId: 'wrong', chips: 10 },
        { marketPlace: 1, bettorPlayerId: 'b', pickPlayerId: 'also-wrong', chips: 20 },
      ],
      winnersByPlace: { 1: 'real-winner' },
    });
    expect(payouts).toEqual([]);
  });
});

describe('mixer round helpers', () => {
  it('sorts rounds by round number without mutating the original array', () => {
    const rounds = [
      { round_no: 3, state: 'open' },
      { round_no: 1, state: 'done' },
      { round_no: 2, state: 'locked' },
    ];

    expect(sortMixerRounds(rounds).map((round) => round.round_no)).toEqual([1, 2, 3]);
    expect(rounds.map((round) => round.round_no)).toEqual([3, 1, 2]);
  });

  it('uses the first unfinished round, or the final round once all are done', () => {
    expect(currentMixerRound([
      { round_no: 1, state: 'done' },
      { round_no: 3, state: 'open' },
      { round_no: 2, state: 'locked' },
    ])).toEqual({ round_no: 2, state: 'locked' });

    expect(currentMixerRound([
      { round_no: 1, state: 'done' },
      { round_no: 2, state: 'done' },
    ])).toEqual({ round_no: 2, state: 'done' });
  });
});

describe('eligibleBallotTargets (0047 gender modes)', () => {
  const roster = [
    { id: 'me', gender: 'f' as const },
    { id: 'm1', gender: 'm' as const },
    { id: 'm2', gender: 'm' as const },
    { id: 'f1', gender: 'f' as const },
    { id: 'x1', gender: null },
  ];
  const me = roster[0];

  it('mixed: shows only the opposite pool and never self', () => {
    const ids = eligibleBallotTargets(roster, me, 'mixed').map((p) => p.id);
    // me is f → pool b → targets are pool a (males + ungendered)
    expect(ids).toEqual(['m1', 'm2', 'x1']);
  });

  it('mixed: a male sees only pool b (women)', () => {
    const ids = eligibleBallotTargets(roster, roster[1], 'mixed').map((p) => p.id);
    expect(ids).toEqual(['me', 'f1']);
  });

  it('mixed: server pool override beats gender-derived pool', () => {
    // Admin moved me (f) into pool a → my targets flip to pool b.
    const ids = eligibleBallotTargets(roster, me, 'mixed', 'a').map((p) => p.id);
    expect(ids).toEqual(['f1']);
  });

  it('same: only players of my own gender', () => {
    expect(eligibleBallotTargets(roster, me, 'same').map((p) => p.id)).toEqual(['f1']);
    expect(eligibleBallotTargets(roster, roster[1], 'same').map((p) => p.id)).toEqual(['m2']);
    // ungendered pairs with ungendered
    expect(eligibleBallotTargets(roster, roster[4], 'same').map((p) => p.id)).toEqual([]);
  });

  it('open: everyone except self', () => {
    expect(eligibleBallotTargets(roster, me, 'open').map((p) => p.id)).toEqual(['m1', 'm2', 'f1', 'x1']);
  });

  it('unknown/null modes fall back to mixed', () => {
    expect(eligibleBallotTargets(roster, me, null).map((p) => p.id)).toEqual(['m1', 'm2', 'x1']);
    expect(eligibleBallotTargets(roster, me, 'coed').map((p) => p.id)).toEqual(['m1', 'm2', 'x1']);
  });
});
