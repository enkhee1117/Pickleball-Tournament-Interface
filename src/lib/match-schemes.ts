// Pure pairing logic for the three doubles formats we support.
//
// Every generator emits an array of MatchDraft. Drafts are JSONB-serialised
// and handed to app_replace_pending_matches() for atomic insertion.

export type MatchDraft = {
  round_label: string;
  court_label: string;
  team_a_label: string;
  team_b_label: string;
};

export type MatchScheme = 'rotating_partners' | 'fixed_partners' | 'single_elimination';

// Default DUPR rating used as a placeholder when a player has no rating on
// file. Mirrors the SQL default in app_create_tournament / app_add_tournament_player
// so balanced/snake pairing has something to work with on day one.
export const DEFAULT_DUPR = 3.2;

const courtLabelFor = (idx: number, courts: number) =>
  `Court ${(idx % Math.max(1, courts)) + 1}`;

// ---------------------------------------------------------------------------
// Scheme 1: Rotating partners (social mixer / Mexicano-style).
// For K rounds, shuffle players, group 4 at a time, pair (1,2) vs (3,4).
// Players not in a complete group-of-4 sit out that round.
// Deterministic when given an rng — pass a seeded rng for testing.
//
// genderMode = 'mixed' enforces 1M+1F per team — the shuffle pulls from
// male and female pools separately and zips them so each team is one of
// each. genderMode = 'same' enforces same-gender per team. 'open' falls
// back to the original blind shuffle.
// ---------------------------------------------------------------------------
export type GenderTag = 'm' | 'f' | 'x';
export type PairingMode = 'random' | 'balanced' | 'snake';
export type RotatingPartnersOptions = {
  rounds: number;
  courts: number;
  rng?: () => number;
  genderMode?: 'open' | 'mixed' | 'same';
  // Optional parallel array — entry i is the gender of the player at
  // players[i]. Required when genderMode is 'mixed' or 'same'.
  genders?: (GenderTag | null | undefined)[];
  // Optional parallel array of DUPR scores. When pairingMode is 'balanced'
  // or 'snake' the generator uses these to distribute strength evenly.
  duprs?: (number | null | undefined)[];
  pairingMode?: PairingMode;
};

export function generateRotatingPartners(
  players: string[],
  options: RotatingPartnersOptions,
): MatchDraft[] {
  const rounds = Math.max(1, Math.min(50, options.rounds));
  const courts = Math.max(1, Math.min(16, options.courts));
  const rng = options.rng ?? Math.random;
  const mode = options.genderMode ?? 'open';
  const pairingMode = options.pairingMode ?? 'random';
  const cleaned = players.map((p) => p.trim()).filter(Boolean);
  if (cleaned.length < 4) return [];

  if (mode === 'mixed' || mode === 'same') {
    return generateGenderedRotatingPartners(cleaned, options.genders ?? [], {
      rounds,
      courts,
      rng,
      mode,
    });
  }

  if (pairingMode === 'balanced' || pairingMode === 'snake') {
    return generateBalancedRotatingPartners(cleaned, options.duprs ?? [], {
      rounds,
      courts,
      rng,
      pairingMode,
    });
  }

  const drafts: MatchDraft[] = [];
  for (let r = 0; r < rounds; r += 1) {
    const shuffled = shuffle(cleaned, rng);
    const gamesThisRound = Math.floor(shuffled.length / 4);
    for (let g = 0; g < gamesThisRound; g += 1) {
      const slice = shuffled.slice(g * 4, g * 4 + 4);
      drafts.push({
        round_label: `Round ${r + 1}`,
        court_label: courtLabelFor(g, courts),
        team_a_label: `${slice[0]} & ${slice[1]}`,
        team_b_label: `${slice[2]} & ${slice[3]}`,
      });
    }
  }
  return drafts;
}

// Balanced rotating partners: each round, redistribute players across the
// available games so each game has a similar total skill, and within each
// game pair high-DUPR with low-DUPR to keep both teams competitive.
//
// Algorithm (per round):
//   1. Sort players by DUPR descending (stable; fall back to 3.20 for null).
//   2. If the roster size isn't a multiple of 4, some players HAVE to sit
//      out the round. We rotate who sits each round (offset by r) so the
//      same person isn't always benched.
//   3. Snake-distribute the in-round players into N games — game 0 gets the
//      highest, game 1 the 2nd-highest, …, then snake back so the lowest
//      DUPR player joins game 0 alongside the highest. Each game ends up
//      with one high, one mid-high, one mid-low, one low.
//   4. Within each game-of-4, sort by DUPR. With players p1 (high), p2, p3,
//      p4 (low):
//        - balanced  → team A = p1 + p4, team B = p2 + p3
//        - snake     → team A = p1 + p2, team B = p3 + p4 (similar-skill teams)
//   5. To keep partners changing across rounds while preserving the balanced
//      distribution, rotate the snake offset by `r % gameCount` each round.
function generateBalancedRotatingPartners(
  players: string[],
  duprs: (number | null | undefined)[],
  opts: { rounds: number; courts: number; rng: () => number; pairingMode: 'balanced' | 'snake' },
): MatchDraft[] {
  // Pair players with their DUPR (default DEFAULT_DUPR when missing) so the
  // sort is deterministic on inputs without scores.
  const indexed = players.map((name, i) => ({
    name,
    dupr: typeof duprs[i] === 'number' ? (duprs[i] as number) : DEFAULT_DUPR,
    rand: 0,
  }));
  const drafts: MatchDraft[] = [];
  const gameCount = Math.floor(indexed.length / 4);
  if (gameCount === 0) return drafts;
  const playersPerRound = gameCount * 4;
  const surplus = indexed.length - playersPerRound;

  for (let r = 0; r < opts.rounds; r += 1) {
    // Assign a per-round random tiebreaker so equal-DUPR players don't always
    // land in the same game.
    for (const p of indexed) p.rand = opts.rng();
    const sorted = [...indexed].sort((a, b) => b.dupr - a.dupr || a.rand - b.rand);

    // Pick the in-round set with a rotating window so players take turns
    // sitting out across rounds when the roster size isn't a multiple of 4.
    const offset = surplus > 0 ? (r * surplus) % indexed.length : 0;
    const inRound = Array.from({ length: playersPerRound }, (_, i) => sorted[(offset + i) % indexed.length]);

    // Snake-distribute. We rotate the starting game by r so the same player
    // doesn't end up in the same position every round.
    const buckets: Array<typeof indexed> = Array.from({ length: gameCount }, () => []);
    inRound.forEach((p, i) => {
      const layer = Math.floor(i / gameCount);
      const within = i % gameCount;
      const target =
        layer % 2 === 0
          ? (within + r) % gameCount
          : (gameCount - 1 - within + r) % gameCount;
      buckets[target].push(p);
    });

    // Pair within each game. Bucket.slice(0,4) is defensive — every bucket
    // should have exactly 4 players given playersPerRound = gameCount * 4.
    buckets.forEach((bucket, g) => {
      if (bucket.length < 4) return;
      const [p1, p2, p3, p4] = [...bucket]
        .sort((a, b) => b.dupr - a.dupr)
        .slice(0, 4);
      const teamA = opts.pairingMode === 'balanced' ? `${p1.name} & ${p4.name}` : `${p1.name} & ${p2.name}`;
      const teamB = opts.pairingMode === 'balanced' ? `${p2.name} & ${p3.name}` : `${p3.name} & ${p4.name}`;
      drafts.push({
        round_label: `Round ${r + 1}`,
        court_label: courtLabelFor(g, opts.courts),
        team_a_label: teamA,
        team_b_label: teamB,
      });
    });
  }
  return drafts;
}

// Mixed-doubles random partner schedule. Builds a pool of M and F players,
// then for each round shuffles each pool independently, zips the first
// min(M,F) into mixed teams (Male & Female), and pairs adjacent teams into
// games. Players in the surplus gender (or marked 'x' / unset) sit out the
// round.
//
// Same-gender mode: shuffles each pool separately and pairs adjacent
// players in the SAME pool into teams. Plays MM vs MM and FF vs FF; the
// pools never mix.
function generateGenderedRotatingPartners(
  players: string[],
  genders: (GenderTag | null | undefined)[],
  opts: { rounds: number; courts: number; rng: () => number; mode: 'mixed' | 'same' },
): MatchDraft[] {
  const males = players.filter((_, i) => genders[i] === 'm');
  const females = players.filter((_, i) => genders[i] === 'f');
  const drafts: MatchDraft[] = [];

  for (let r = 0; r < opts.rounds; r += 1) {
    const teams: string[] = [];
    if (opts.mode === 'mixed') {
      const m = shuffle(males, opts.rng);
      const f = shuffle(females, opts.rng);
      const pairCount = Math.min(m.length, f.length);
      for (let i = 0; i < pairCount; i += 1) {
        teams.push(`${m[i]} & ${f[i]}`);
      }
    } else {
      // 'same': MM teams from male pool, FF teams from female pool.
      const m = shuffle(males, opts.rng);
      const f = shuffle(females, opts.rng);
      for (let i = 0; i + 1 < m.length; i += 2) teams.push(`${m[i]} & ${m[i + 1]}`);
      for (let i = 0; i + 1 < f.length; i += 2) teams.push(`${f[i]} & ${f[i + 1]}`);
    }
    // Pair adjacent teams into games. Surplus team (odd team count) sits out.
    let courtIdx = 0;
    for (let i = 0; i + 1 < teams.length; i += 2) {
      drafts.push({
        round_label: `Round ${r + 1}`,
        court_label: courtLabelFor(courtIdx, opts.courts),
        team_a_label: teams[i],
        team_b_label: teams[i + 1],
      });
      courtIdx += 1;
    }
  }
  return drafts;
}

// ---------------------------------------------------------------------------
// Scheme 2: Fixed partners doubles round-robin.
// Pair adjacent players into teams (P1+P2, P3+P4, ...), then schedule via
// circle method so every team plays every other team exactly once.
// If K (team count) is odd, one team rests per round.
// ---------------------------------------------------------------------------
export function generateFixedPartners(
  players: string[],
  options: {
    courts: number;
    // When set to 'mixed' the pairer zips males with females so every team
    // is M+F. 'same' produces M+M / F+F teams. 'open' / undefined keeps the
    // legacy "pair adjacent in the input order" behaviour.
    genderMode?: 'open' | 'mixed' | 'same';
    genders?: (GenderTag | null | undefined)[];
  },
): MatchDraft[] {
  const courts = Math.max(1, Math.min(16, options.courts));
  const cleaned = players.map((p) => p.trim()).filter(Boolean);
  if (cleaned.length < 4) return [];

  const teams = pairFixedPartnersTeams(cleaned, options.genderMode ?? 'open', options.genders ?? []);
  return circleMethodSchedule(teams, courts);
}

// Build the fixed-partners team list. Exported so unit tests can lock in
// the M/F invariant without having to call the full circleMethodSchedule.
//
// 'mixed': zip M list with F list. Surplus of either gender is dropped
//          (or paired same-sex at the tail end if the caller's roster is
//          imbalanced) so we can't silently produce M+M / F+F teams.
// 'same':  pair within each gender bucket — M+M, F+F. Mismatched leftovers
//          drop out.
// 'open' / unset: legacy adjacent-pair (preserves existing behaviour for
//          gender-agnostic tournaments).
export function pairFixedPartnersTeams(
  players: string[],
  genderMode: 'open' | 'mixed' | 'same',
  genders: (GenderTag | null | undefined)[],
): string[] {
  if (genderMode === 'mixed') {
    const males: string[] = [];
    const females: string[] = [];
    const ungendered: string[] = [];
    players.forEach((name, i) => {
      const g = genders[i];
      if (g === 'm') males.push(name);
      else if (g === 'f') females.push(name);
      else ungendered.push(name);
    });
    // Distribute ungendered players to whichever bucket needs them. This
    // is a best-effort recovery so the team count doesn't collapse when
    // someone forgot to tag a row — but it'll bias the assignment.
    while (ungendered.length > 0 && males.length < females.length) {
      males.push(ungendered.shift()!);
    }
    while (ungendered.length > 0 && females.length < males.length) {
      females.push(ungendered.shift()!);
    }
    while (ungendered.length >= 2) {
      males.push(ungendered.shift()!);
      females.push(ungendered.shift()!);
    }
    const teamCount = Math.min(males.length, females.length);
    const teams: string[] = [];
    for (let i = 0; i < teamCount; i += 1) {
      teams.push(`${males[i]} & ${females[i]}`);
    }
    return teams;
  }

  if (genderMode === 'same') {
    const males: string[] = [];
    const females: string[] = [];
    players.forEach((name, i) => {
      const g = genders[i];
      if (g === 'm') males.push(name);
      else if (g === 'f') females.push(name);
    });
    const teams: string[] = [];
    for (let i = 0; i + 1 < males.length; i += 2) {
      teams.push(`${males[i]} & ${males[i + 1]}`);
    }
    for (let i = 0; i + 1 < females.length; i += 2) {
      teams.push(`${females[i]} & ${females[i + 1]}`);
    }
    return teams;
  }

  // Open: pair adjacent (preserves legacy behaviour).
  const teams: string[] = [];
  for (let i = 0; i + 1 < players.length; i += 2) {
    teams.push(`${players[i]} & ${players[i + 1]}`);
  }
  return teams;
}

// ---------------------------------------------------------------------------
// Scheme 3: Single elimination bracket (round 1 only).
// Pair adjacent players into teams. Pad to next power of 2 with BYE teams.
// Standard bracket seeding: 1 vs N, 2 vs N-1, etc.
// Auto-advance any team paired with BYE; emit only real R1 matches.
// ---------------------------------------------------------------------------
export function generateSingleElimination(
  players: string[],
  options: { courts: number },
): MatchDraft[] {
  const courts = Math.max(1, Math.min(16, options.courts));
  const cleaned = players.map((p) => p.trim()).filter(Boolean);
  if (cleaned.length < 4) return [];

  const teams: string[] = [];
  for (let i = 0; i + 1 < cleaned.length; i += 2) {
    teams.push(`${cleaned[i]} & ${cleaned[i + 1]}`);
  }
  if (teams.length < 2) return [];

  const targetSize = nextPowerOfTwo(teams.length);
  const padded = [...teams];
  while (padded.length < targetSize) padded.push('BYE');

  const drafts: MatchDraft[] = [];
  let courtIdx = 0;
  for (let i = 0; i < padded.length / 2; i += 1) {
    const a = padded[i];
    const b = padded[padded.length - 1 - i];
    if (a === 'BYE' || b === 'BYE') continue;
    drafts.push({
      round_label: 'Round 1',
      court_label: courtLabelFor(courtIdx, courts),
      team_a_label: a,
      team_b_label: b,
    });
    courtIdx += 1;
  }
  return drafts;
}

// ---------------------------------------------------------------------------
// Scheme 4: Fixed partners with manually composed teams.
// Same circle-method scheduling as scheme 2, but the caller supplies the
// list of team labels directly instead of pairing adjacent players in the
// roster. Used by the "I'll set teams" flow on the invite page.
// ---------------------------------------------------------------------------
export function generateFixedPartnersFromTeams(
  teams: string[],
  options: { courts: number },
): MatchDraft[] {
  const cleaned = teams.map((t) => t.trim()).filter(Boolean);
  if (cleaned.length < 2) return [];
  return circleMethodSchedule(cleaned, Math.max(1, Math.min(16, options.courts)));
}

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

// Standard circle-method round-robin: K teams, K-1 rounds, K/2 games per
// round. If K is odd we add a BYE slot and any pairing with BYE is dropped.
function circleMethodSchedule(teams: string[], courts: number): MatchDraft[] {
  const working = teams.slice();
  const hasBye = working.length % 2 === 1;
  if (hasBye) working.push('BYE');
  const K = working.length;

  // Position 0 stays fixed; the remaining K-1 positions rotate clockwise.
  const positions = Array.from({ length: K }, (_, i) => i);
  const drafts: MatchDraft[] = [];

  for (let round = 0; round < K - 1; round += 1) {
    let courtIdx = 0;
    for (let i = 0; i < K / 2; i += 1) {
      const aIdx = positions[i];
      const bIdx = positions[K - 1 - i];
      const a = working[aIdx];
      const b = working[bIdx];
      if (a === 'BYE' || b === 'BYE') continue;
      drafts.push({
        round_label: `Round ${round + 1}`,
        court_label: courtLabelFor(courtIdx, courts),
        team_a_label: a,
        team_b_label: b,
      });
      courtIdx += 1;
    }
    // Rotate: keep positions[0], move positions[K-1] to positions[1].
    const rotated = [positions[0], positions[K - 1], ...positions.slice(1, K - 1)];
    for (let i = 0; i < K; i += 1) positions[i] = rotated[i];
  }
  return drafts;
}

// ---------------------------------------------------------------------------
// Convenience entry point used by the server action.
// ---------------------------------------------------------------------------
export type GenerateMatchesInput =
  | {
      scheme: 'rotating_partners';
      players: string[];
      rounds: number;
      courts: number;
      rng?: () => number;
      genderMode?: 'open' | 'mixed' | 'same';
      genders?: (GenderTag | null | undefined)[];
      pairingMode?: PairingMode;
      duprs?: (number | null | undefined)[];
    }
  | {
      scheme: 'fixed_partners';
      players: string[];
      courts: number;
      genderMode?: 'open' | 'mixed' | 'same';
      genders?: (GenderTag | null | undefined)[];
    }
  | { scheme: 'single_elimination'; players: string[]; courts: number };

export function generateMatchDrafts(input: GenerateMatchesInput): MatchDraft[] {
  switch (input.scheme) {
    case 'rotating_partners':
      return generateRotatingPartners(input.players, {
        rounds: input.rounds,
        courts: input.courts,
        rng: input.rng,
        genderMode: input.genderMode,
        genders: input.genders,
        pairingMode: input.pairingMode,
        duprs: input.duprs,
      });
    case 'fixed_partners':
      return generateFixedPartners(input.players, {
        courts: input.courts,
        genderMode: input.genderMode,
        genders: input.genders,
      });
    case 'single_elimination':
      return generateSingleElimination(input.players, { courts: input.courts });
  }
}
