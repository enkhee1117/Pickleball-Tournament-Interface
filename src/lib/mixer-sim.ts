// Synthetic ballot generation for the organizer's "simulate votes" harness.
// Pure + deterministic (rng injectable) so it's unit-testable; the server
// action feeds each generated ballot to app_mixer_admin_set_ballot, which
// re-validates everything, so this only has to produce *plausible* ballots
// within a voter's real eligibility and budget.

import {
  eligibleBallotTargets,
  MIXER_UPVOTE_CAP_PER_TARGET,
  type BallotCandidate,
  type MixerPool,
} from './mixer';

export type SimVoter = BallotCandidate & { pool?: MixerPool };
export type SimBallotItem = { target_player_id: string; up_tokens: number; down_tokens: number };

// Distribute `availableTokens * spendFraction` up-tokens across the voter's
// eligible targets, one token at a time for an even spread, never exceeding the
// per-target cap. Returns [] when there's nothing eligible or no budget.
export function generateSimBallot({
  voter,
  roster,
  genderMode,
  availableTokens,
  cap = MIXER_UPVOTE_CAP_PER_TARGET,
  spendFraction = 1,
  rng = Math.random,
}: {
  voter: SimVoter;
  roster: BallotCandidate[];
  genderMode: string | null | undefined;
  availableTokens: number;
  cap?: number;
  spendFraction?: number;
  rng?: () => number;
}): SimBallotItem[] {
  const targets = eligibleBallotTargets(roster, voter, genderMode, voter.pool);
  const clampedFraction = Math.max(0, Math.min(1, spendFraction));
  let budget = Math.max(0, Math.min(availableTokens, Math.round(availableTokens * clampedFraction)));
  if (targets.length === 0 || budget <= 0) return [];

  const shuffled = [...targets].sort(() => rng() - 0.5);
  const totalCapacity = shuffled.length * cap;
  budget = Math.min(budget, totalCapacity); // can't spend more than targets can hold

  const alloc = new Map<string, number>();
  let i = 0;
  while (budget > 0) {
    const candidate = shuffled[i % shuffled.length];
    const cur = alloc.get(candidate.id) ?? 0;
    if (cur < cap) {
      alloc.set(candidate.id, cur + 1);
      budget -= 1;
    }
    i += 1;
  }

  return [...alloc.entries()].map(([target_player_id, up_tokens]) => ({
    target_player_id,
    up_tokens,
    down_tokens: 0,
  }));
}
