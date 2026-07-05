import { describe, expect, it } from 'vitest';
import { generateSimBallot } from './mixer-sim';

// Deterministic RNG so shuffles/spreads are reproducible.
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

// 4 men (pool a) + 4 women (pool b). Mixed mode: a man can only fund women.
const roster = [
  { id: 'm1', gender: 'm' as const },
  { id: 'm2', gender: 'm' as const },
  { id: 'm3', gender: 'm' as const },
  { id: 'm4', gender: 'm' as const },
  { id: 'w1', gender: 'f' as const },
  { id: 'w2', gender: 'f' as const },
  { id: 'w3', gender: 'f' as const },
  { id: 'w4', gender: 'f' as const },
];

const sum = (b: { up_tokens: number; down_tokens: number }[]) =>
  b.reduce((t, v) => t + v.up_tokens + v.down_tokens, 0);

describe('generateSimBallot', () => {
  it('spends exactly the available budget when capacity allows', () => {
    const ballot = generateSimBallot({
      voter: { id: 'm1', gender: 'm' },
      roster,
      genderMode: 'mixed',
      availableTokens: 10,
      rng: seeded(1),
    });
    expect(sum(ballot)).toBe(10);
  });

  it('only funds the opposite pool in mixed mode (never same-gender or self)', () => {
    const ballot = generateSimBallot({
      voter: { id: 'm1', gender: 'm' },
      roster,
      genderMode: 'mixed',
      availableTokens: 10,
      rng: seeded(2),
    });
    expect(ballot.every((v) => v.target_player_id.startsWith('w'))).toBe(true);
    expect(ballot.some((v) => v.target_player_id === 'm1')).toBe(false);
  });

  it('never exceeds the per-target cap', () => {
    const ballot = generateSimBallot({
      voter: { id: 'm1', gender: 'm' },
      roster,
      genderMode: 'mixed',
      availableTokens: 100, // far more than 4 targets * cap 3 = 12
      cap: 3,
      rng: seeded(3),
    });
    expect(ballot.every((v) => v.up_tokens <= 3)).toBe(true);
    // capacity-bounded: 4 eligible women * 3 = 12
    expect(sum(ballot)).toBe(12);
  });

  it('honours spendFraction (light pass spends about half)', () => {
    const ballot = generateSimBallot({
      voter: { id: 'm1', gender: 'm' },
      roster,
      genderMode: 'mixed',
      availableTokens: 10,
      spendFraction: 0.5,
      rng: seeded(4),
    });
    expect(sum(ballot)).toBe(5);
  });

  it('returns nothing with no budget or no eligible targets', () => {
    expect(
      generateSimBallot({ voter: { id: 'm1', gender: 'm' }, roster, genderMode: 'mixed', availableTokens: 0 }),
    ).toEqual([]);
    // same-gender-only voter in an all-male eligible set with themselves excluded still fine;
    // but an empty roster yields nothing.
    expect(
      generateSimBallot({ voter: { id: 'x', gender: 'm' }, roster: [], genderMode: 'open', availableTokens: 5 }),
    ).toEqual([]);
  });
});
