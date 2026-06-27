import { describe, expect, it } from 'vitest';
import {
  computeRaffleTickets,
  drawMixerPairs,
  mixerPairWeight,
  settleParimutuelBets,
  type MixerPlayer,
  type MixerVote,
} from '@/lib/mixer';

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
