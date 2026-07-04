export type MixerRoundState = 'open' | 'locked' | 'drawing' | 'revealed' | 'playing' | 'done';
export type MixerPool = 'a' | 'b';

export type MixerFormulaConfig = {
  alpha: number;
  beta: number;
  gamma: number;
  tau: number;
  griefFloor: number;
  repeatDecay: number;
};

export const DEFAULT_MIXER_CONFIG: MixerFormulaConfig = {
  alpha: 1,
  beta: 2.5,
  gamma: 1,
  tau: 2,
  griefFloor: 4,
  repeatDecay: 0.2,
};

// Mirrors event_config.upvote_cap_per_target. Enforced server-side in
// app_mixer_set_vote (migration 0044); also used here so client UI can
// preflight the same limit instead of round-tripping for the rejection.
export const MIXER_UPVOTE_CAP_PER_TARGET = 3;

export function isUpvoteAllocationValid(
  upTokens: number,
  cap: number = MIXER_UPVOTE_CAP_PER_TARGET,
): boolean {
  return Number.isFinite(upTokens) && upTokens >= 0 && upTokens <= cap;
}

export type MixerVote = {
  voterPlayerId: string;
  targetPlayerId: string;
  upTokens: number;
  downTokens: number;
};

export type MixerPlayer = {
  id: string;
  name: string;
  pool: MixerPool;
  seedRating?: number | null;
  sitOutCount?: number;
  satLastRound?: boolean;
};

export type MixerPairingHistory = Record<string, number>;

export type MixerPair = {
  playerAId: string;
  playerBId: string;
  weight: number;
};

export type MixerDrawResult = {
  pairs: MixerPair[];
  sitOuts: string[];
};

export type RaffleInput = {
  playerId: string;
  baseTokensRemaining: number;
  boughtTokensRemaining?: number;
};

export type RaffleTickets = {
  playerId: string;
  tickets: number;
  popularityTickets: number;
  frugalityTickets: number;
};

export type Bet = {
  marketPlace: number;
  bettorPlayerId: string;
  pickPlayerId: string;
  chips: number;
};

export type BetSettlement = {
  bettorPlayerId: string;
  marketPlace: number;
  payout: number;
};

const pairKey = (a: string, b: string) => [a, b].sort().join(':');

function voteFor(votes: MixerVote[], voterPlayerId: string, targetPlayerId: string): MixerVote {
  return (
    votes.find((v) => v.voterPlayerId === voterPlayerId && v.targetPlayerId === targetPlayerId) ?? {
      voterPlayerId,
      targetPlayerId,
      upTokens: 0,
      downTokens: 0,
    }
  );
}

export function mixerPairScore(
  playerAId: string,
  playerBId: string,
  votes: MixerVote[],
  config: MixerFormulaConfig = DEFAULT_MIXER_CONFIG,
): number {
  const ab = voteFor(votes, playerAId, playerBId);
  const ba = voteFor(votes, playerBId, playerAId);
  const raw =
    config.alpha * (ab.upTokens + ba.upTokens) +
    config.beta * Math.sqrt(ab.upTokens * ba.upTokens) -
    config.gamma * (ab.downTokens + ba.downTokens);
  return Math.max(raw, -config.griefFloor);
}

export function mixerPairWeight(
  playerAId: string,
  playerBId: string,
  votes: MixerVote[],
  history: MixerPairingHistory = {},
  config: MixerFormulaConfig = DEFAULT_MIXER_CONFIG,
): number {
  // tau is in the denominator of exp(score/τ). SQL constraints τ ≥ 0.01;
  // guard here so the TS lib never returns NaN/Infinity if a caller hands
  // in a bad config.
  const tau = config.tau > 0 ? config.tau : 0.01;
  const score = mixerPairScore(playerAId, playerBId, votes, config);
  const repeatCount = history[pairKey(playerAId, playerBId)] ?? 0;
  return Math.exp(score / tau) * Math.pow(config.repeatDecay, repeatCount);
}

export function chooseMixerSitOuts(players: MixerPlayer[], rng: () => number = Math.random): string[] {
  const byPool: Record<MixerPool, MixerPlayer[]> = {
    a: players.filter((p) => p.pool === 'a'),
    b: players.filter((p) => p.pool === 'b'),
  };
  const target = Math.min(byPool.a.length, byPool.b.length);
  const sitOuts: string[] = [];

  for (const pool of ['a', 'b'] as const) {
    const needed = byPool[pool].length - target;
    if (needed <= 0) continue;
    const ordered = [...byPool[pool]].sort((x, y) => {
      const sx = x.sitOutCount ?? 0;
      const sy = y.sitOutCount ?? 0;
      if (sx !== sy) return sx - sy;
      if (!!x.satLastRound !== !!y.satLastRound) return x.satLastRound ? 1 : -1;
      return rng() - 0.5;
    });
    sitOuts.push(...ordered.slice(0, needed).map((p) => p.id));
  }
  return sitOuts;
}

export function drawMixerPairs({
  players,
  votes,
  history = {},
  config = DEFAULT_MIXER_CONFIG,
  rng = Math.random,
}: {
  players: MixerPlayer[];
  votes: MixerVote[];
  history?: MixerPairingHistory;
  config?: MixerFormulaConfig;
  rng?: () => number;
}): MixerDrawResult {
  const sitOuts = chooseMixerSitOuts(players, rng);
  const sitting = new Set(sitOuts);
  const poolA = players.filter((p) => p.pool === 'a' && !sitting.has(p.id));
  const poolB = players.filter((p) => p.pool === 'b' && !sitting.has(p.id));
  const unpairedB = new Set(poolB.map((p) => p.id));
  const shuffledA = [...poolA].sort(() => rng() - 0.5);
  const pairs: MixerPair[] = [];

  for (const a of shuffledA) {
    const choices = [...unpairedB].map((b) => ({
      id: b,
      weight: mixerPairWeight(a.id, b, votes, history, config),
    }));
    const total = choices.reduce((s, c) => s + c.weight, 0);
    let cursor = rng() * total;
    let picked = choices[choices.length - 1];
    for (const choice of choices) {
      cursor -= choice.weight;
      if (cursor <= 0) {
        picked = choice;
        break;
      }
    }
    if (!picked) continue;
    pairs.push({ playerAId: a.id, playerBId: picked.id, weight: picked.weight });
    unpairedB.delete(picked.id);
  }

  return { pairs, sitOuts };
}

export function computeRaffleTickets({
  votes,
  states,
  popularityWeight = 1,
  frugalityWeight = 0.5,
  perVoterCap = 3,
}: {
  votes: MixerVote[];
  states: RaffleInput[];
  popularityWeight?: number;
  frugalityWeight?: number;
  perVoterCap?: number;
}): RaffleTickets[] {
  return states.map((state) => {
    const popularityTickets =
      votes
        .filter((v) => v.targetPlayerId === state.playerId)
        .reduce((sum, v) => sum + Math.min(v.upTokens, perVoterCap), 0) * popularityWeight;
    const frugalityTickets = Math.max(0, state.baseTokensRemaining) * frugalityWeight;
    return {
      playerId: state.playerId,
      tickets: popularityTickets + frugalityTickets,
      popularityTickets,
      frugalityTickets,
    };
  });
}

export function settleParimutuelBets({
  bets,
  winnersByPlace,
  rakePct = 0,
}: {
  bets: Bet[];
  winnersByPlace: Record<number, string>;
  rakePct?: number;
}): BetSettlement[] {
  const settlements: BetSettlement[] = [];
  const places = [...new Set(bets.map((b) => b.marketPlace))];
  for (const place of places) {
    const marketBets = bets.filter((b) => b.marketPlace === place);
    const pot = marketBets.reduce((s, b) => s + b.chips, 0) * (1 - rakePct);
    const winner = winnersByPlace[place];
    const correct = marketBets.filter((b) => b.pickPlayerId === winner);
    const correctStake = correct.reduce((s, b) => s + b.chips, 0);
    for (const bet of correct) {
      settlements.push({
        bettorPlayerId: bet.bettorPlayerId,
        marketPlace: place,
        payout: correctStake > 0 ? Math.floor((bet.chips / correctStake) * pot) : 0,
      });
    }
  }
  return settlements;
}

// ---------------------------------------------------------------------------
// Ballot target eligibility (0047 gender modes)
// ---------------------------------------------------------------------------

export type MixerGenderMode = 'mixed' | 'same' | 'open';

export type BallotCandidate = {
  id: string;
  gender: 'm' | 'f' | 'x' | null;
};

// Who can this player spend tokens on? Mirrors the draw's pairing
// constraints so a ballot can never fund an impossible pairing:
//   mixed — the opposite gender pool (f→b, everyone else→a)
//   same  — players of the same gender only
//   open  — everyone but yourself
// selfPoolOverride: pass the server-side pairing_pool when known (an admin
// can re-pool a player, which beats the gender-derived default in mixed).
export function eligibleBallotTargets<T extends BallotCandidate>(
  roster: T[],
  self: BallotCandidate,
  genderMode: string | null | undefined,
  selfPoolOverride?: MixerPool,
): T[] {
  const mode: MixerGenderMode =
    genderMode === 'same' || genderMode === 'open' ? genderMode : 'mixed';
  const poolOf = (p: BallotCandidate): MixerPool => (p.gender === 'f' ? 'b' : 'a');
  const selfPool = selfPoolOverride ?? poolOf(self);
  return roster.filter((p) => {
    if (p.id === self.id) return false;
    if (mode === 'same') return (p.gender ?? 'x') === (self.gender ?? 'x');
    if (mode === 'open') return true;
    return poolOf(p) !== selfPool;
  });
}
