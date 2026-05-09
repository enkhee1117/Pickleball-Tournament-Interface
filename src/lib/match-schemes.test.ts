import { describe, expect, it } from 'vitest';
import {
  generateFixedPartners,
  generateFixedPartnersFromTeams,
  generateRotatingPartners,
  generateSingleElimination,
  generateMatchDrafts,
  pairFixedPartnersTeams,
  type MatchDraft,
} from '@/lib/match-schemes';

// Deterministic rng for tests: linear congruential, seedable.
function seedRng(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 0x100000000;
    return s / 0x100000000;
  };
}

const player = (n: number) => `P${n}`;
const players = (n: number) => Array.from({ length: n }, (_, i) => player(i + 1));

describe('generateRotatingPartners', () => {
  it('returns no drafts when fewer than 4 players', () => {
    expect(generateRotatingPartners(players(3), { rounds: 5, courts: 2 })).toEqual([]);
  });

  it('produces rounds * floor(N/4) games', () => {
    const drafts = generateRotatingPartners(players(8), { rounds: 4, courts: 2, rng: seedRng() });
    expect(drafts).toHaveLength(8); // 4 rounds * 2 games
  });

  it('produces 2v2 doubles labels (always contains " & ")', () => {
    const drafts = generateRotatingPartners(players(8), { rounds: 2, courts: 2, rng: seedRng() });
    for (const d of drafts) {
      expect(d.team_a_label).toMatch(/ & /);
      expect(d.team_b_label).toMatch(/ & /);
    }
  });

  it('benches odd extras (5 players → 1 game per round)', () => {
    const drafts = generateRotatingPartners(players(5), { rounds: 3, courts: 2, rng: seedRng() });
    expect(drafts).toHaveLength(3);
  });

  it('rotates court labels up to courts parameter', () => {
    const drafts = generateRotatingPartners(players(12), { rounds: 1, courts: 2, rng: seedRng() });
    const courts = drafts.map((d) => d.court_label);
    expect(courts).toEqual(['Court 1', 'Court 2', 'Court 1']);
  });

  it('partitions each round into disjoint groups of 4', () => {
    const drafts = generateRotatingPartners(players(8), { rounds: 1, courts: 2, rng: seedRng() });
    const named = (s: string) => s.split(' & ');
    const r1players = drafts.flatMap((d) => [...named(d.team_a_label), ...named(d.team_b_label)]);
    expect(new Set(r1players).size).toBe(8);
  });

  // Regression coverage: mixed RR rotating partners must never produce
  // M+M / F+F teams. The auto-generator picks fresh partners every round
  // so any stale "two same gender" pairing is a real bug.
  it('mixed mode produces only M+F teams across many rounds', () => {
    const names = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const genders: ('m' | 'f')[] = ['m', 'm', 'm', 'm', 'f', 'f', 'f', 'f'];
    const drafts = generateRotatingPartners(names, {
      rounds: 5,
      courts: 2,
      rng: seedRng(7),
      genderMode: 'mixed',
      genders,
    });
    expect(drafts.length).toBeGreaterThan(0);
    for (const d of drafts) {
      for (const team of [d.team_a_label, d.team_b_label]) {
        const [a, b] = team.split(' & ');
        const gA = genders[names.indexOf(a)];
        const gB = genders[names.indexOf(b)];
        expect(new Set([gA, gB])).toEqual(new Set(['m', 'f']));
      }
    }
  });

  // Same-gender mode: every team must be all-male or all-female.
  it('same mode produces only M+M and F+F teams', () => {
    const names = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const genders: ('m' | 'f')[] = ['m', 'm', 'm', 'm', 'f', 'f', 'f', 'f'];
    const drafts = generateRotatingPartners(names, {
      rounds: 4,
      courts: 2,
      rng: seedRng(11),
      genderMode: 'same',
      genders,
    });
    for (const d of drafts) {
      for (const team of [d.team_a_label, d.team_b_label]) {
        const [a, b] = team.split(' & ');
        expect(genders[names.indexOf(a)]).toBe(genders[names.indexOf(b)]);
      }
    }
  });
});

describe('generateFixedPartners', () => {
  it('uses circle method: K teams → K-1 rounds with K/2 games each', () => {
    const drafts = generateFixedPartners(players(8), { courts: 2 });
    // 4 teams → 3 rounds * 2 games = 6 games
    expect(drafts).toHaveLength(6);
  });

  it('every pair of teams plays exactly once', () => {
    const drafts = generateFixedPartners(players(8), { courts: 2 });
    const seen = new Set<string>();
    for (const d of drafts) {
      const key = [d.team_a_label, d.team_b_label].sort().join('|');
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
    // 4 choose 2 = 6 unique matchups
    expect(seen.size).toBe(6);
  });

  it('handles odd team counts with a bye each round', () => {
    // 6 players → 3 teams → odd; circle method adds BYE → 3 rounds, 1 real game each
    const drafts = generateFixedPartners(players(6), { courts: 1 });
    // 3 teams, 3 unique matchups
    expect(drafts).toHaveLength(3);
    const teamSet = new Set(drafts.flatMap((d) => [d.team_a_label, d.team_b_label]));
    for (const team of teamSet) {
      expect(team).not.toBe('BYE');
    }
  });

  it('returns no drafts with fewer than 4 players', () => {
    expect(generateFixedPartners(players(3), { courts: 2 })).toEqual([]);
  });

  it('produces 2v2 doubles labels', () => {
    const drafts = generateFixedPartners(players(8), { courts: 2 });
    for (const d of drafts) {
      expect(d.team_a_label).toMatch(/ & /);
      expect(d.team_b_label).toMatch(/ & /);
    }
  });

  // Regression: legacy generateFixedPartners just paired adjacent players in
  // roster order, so a fp-mixed tournament could end up with M+M / F+F
  // teams whenever the roster happened to list two of the same gender in a
  // row. Lock in the M/F invariant for the mixed mode.
  describe('mixed-gender pairing', () => {
    const names = ['M1', 'M2', 'F1', 'F2', 'M3', 'F3', 'F4', 'M4'];
    const genders: ('m' | 'f')[] = ['m', 'm', 'f', 'f', 'm', 'f', 'f', 'm'];

    it('every team has exactly one M and one F', () => {
      const teams = pairFixedPartnersTeams(names, 'mixed', genders);
      expect(teams).toHaveLength(4);
      for (const t of teams) {
        const [a, b] = t.split(' & ');
        const ga = genders[names.indexOf(a)];
        const gb = genders[names.indexOf(b)];
        expect(new Set([ga, gb])).toEqual(new Set(['m', 'f']));
      }
    });

    it('uses each player exactly once across the team list', () => {
      const teams = pairFixedPartnersTeams(names, 'mixed', genders);
      const used = teams.flatMap((t) => t.split(' & '));
      expect(new Set(used).size).toBe(used.length);
      expect(used.sort()).toEqual([...names].sort());
    });

    it('drops the surplus gender when the roster is imbalanced (3M + 5F → 3 teams)', () => {
      const ns = ['M1', 'M2', 'M3', 'F1', 'F2', 'F3', 'F4', 'F5'];
      const gs: ('m' | 'f')[] = ['m', 'm', 'm', 'f', 'f', 'f', 'f', 'f'];
      const teams = pairFixedPartnersTeams(ns, 'mixed', gs);
      expect(teams).toHaveLength(3);
      for (const t of teams) {
        const [a, b] = t.split(' & ');
        expect(new Set([gs[ns.indexOf(a)], gs[ns.indexOf(b)]])).toEqual(new Set(['m', 'f']));
      }
    });

    it('flows through generateFixedPartners with genderMode=mixed', () => {
      const drafts = generateFixedPartners(names, { courts: 2, genderMode: 'mixed', genders });
      // 4 teams → 6 unique matchups
      expect(drafts).toHaveLength(6);
      // Every team label must be M+F
      const allTeams = new Set(drafts.flatMap((d) => [d.team_a_label, d.team_b_label]));
      for (const t of allTeams) {
        const [a, b] = t.split(' & ');
        expect(new Set([genders[names.indexOf(a)], genders[names.indexOf(b)]])).toEqual(
          new Set(['m', 'f']),
        );
      }
    });
  });

  describe('same-gender pairing', () => {
    const names = ['M1', 'M2', 'F1', 'F2', 'M3', 'M4', 'F3', 'F4'];
    const genders: ('m' | 'f')[] = ['m', 'm', 'f', 'f', 'm', 'm', 'f', 'f'];

    it('only produces M+M and F+F teams', () => {
      const teams = pairFixedPartnersTeams(names, 'same', genders);
      for (const t of teams) {
        const [a, b] = t.split(' & ');
        const ga = genders[names.indexOf(a)];
        const gb = genders[names.indexOf(b)];
        expect(ga).toBe(gb);
      }
    });

    it('flows through generateFixedPartners with genderMode=same', () => {
      const drafts = generateFixedPartners(names, { courts: 2, genderMode: 'same', genders });
      const allTeams = new Set(drafts.flatMap((d) => [d.team_a_label, d.team_b_label]));
      for (const t of allTeams) {
        const [a, b] = t.split(' & ');
        expect(genders[names.indexOf(a)]).toBe(genders[names.indexOf(b)]);
      }
    });
  });

  describe('open mode (legacy adjacent pairing)', () => {
    it('preserves the historical adjacent-pair ordering', () => {
      const teams = pairFixedPartnersTeams(['A', 'B', 'C', 'D'], 'open', []);
      expect(teams).toEqual(['A & B', 'C & D']);
    });
  });
});

describe('generateSingleElimination', () => {
  it('round 1 only, with N/2 games for power-of-2 team counts', () => {
    const drafts = generateSingleElimination(players(8), { courts: 2 });
    // 4 teams → 2 round-1 games
    expect(drafts).toHaveLength(2);
    expect(drafts.every((d) => d.round_label === 'Round 1')).toBe(true);
  });

  it('pads with BYEs and skips pairings against BYE', () => {
    // 6 players → 3 teams → padded to 4 (1 BYE)
    // Standard bracket pairs: 1 vs 4, 2 vs 3. Team 4 is BYE so only 2v3 emitted.
    const drafts = generateSingleElimination(players(6), { courts: 2 });
    expect(drafts).toHaveLength(1);
    expect(drafts[0].team_a_label).not.toBe('BYE');
    expect(drafts[0].team_b_label).not.toBe('BYE');
  });

  it('returns no drafts when fewer than 4 players', () => {
    expect(generateSingleElimination(players(3), { courts: 2 })).toEqual([]);
  });

  it('produces 2v2 doubles labels', () => {
    const drafts = generateSingleElimination(players(8), { courts: 2 });
    for (const d of drafts) {
      expect(d.team_a_label).toMatch(/ & /);
      expect(d.team_b_label).toMatch(/ & /);
    }
  });
});

describe('generateFixedPartnersFromTeams (manual pairing)', () => {
  const teams = ['Alice & Bob', 'Carol & Dan', 'Eve & Finn', 'Gail & Ivan'];

  it('schedules every pair of teams exactly once for an even team count', () => {
    const drafts = generateFixedPartnersFromTeams(teams, { courts: 2 });
    expect(drafts).toHaveLength(6); // C(4,2)
    const seen = new Set<string>();
    for (const d of drafts) {
      const key = [d.team_a_label, d.team_b_label].sort().join('|');
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it('preserves the team labels supplied by the caller', () => {
    const drafts = generateFixedPartnersFromTeams(teams, { courts: 1 });
    const labels = new Set(drafts.flatMap((d) => [d.team_a_label, d.team_b_label]));
    for (const team of teams) {
      expect(labels.has(team)).toBe(true);
    }
    expect(labels.has('BYE')).toBe(false);
  });

  it('handles odd team counts with a BYE per round', () => {
    const drafts = generateFixedPartnersFromTeams(teams.slice(0, 3), { courts: 1 });
    expect(drafts).toHaveLength(3); // C(3,2)
    for (const d of drafts) {
      expect(d.team_a_label).not.toBe('BYE');
      expect(d.team_b_label).not.toBe('BYE');
    }
  });

  it('returns no drafts for fewer than two teams', () => {
    expect(generateFixedPartnersFromTeams([], { courts: 2 })).toEqual([]);
    expect(generateFixedPartnersFromTeams(['Solo & Player'], { courts: 2 })).toEqual([]);
  });

  it('rotates court labels up to courts parameter', () => {
    const drafts = generateFixedPartnersFromTeams(teams, { courts: 2 });
    const courts = drafts.slice(0, 2).map((d) => d.court_label);
    expect(courts).toEqual(['Court 1', 'Court 2']);
  });
});

describe('generateMatchDrafts dispatcher', () => {
  const want2v2 = (drafts: MatchDraft[]) => {
    for (const d of drafts) {
      expect(d.team_a_label).toMatch(/ & /);
      expect(d.team_b_label).toMatch(/ & /);
    }
  };
  it('dispatches each scheme', () => {
    want2v2(generateMatchDrafts({ scheme: 'rotating_partners', players: players(8), rounds: 2, courts: 2, rng: seedRng() }));
    want2v2(generateMatchDrafts({ scheme: 'fixed_partners', players: players(8), courts: 2 }));
    want2v2(generateMatchDrafts({ scheme: 'single_elimination', players: players(8), courts: 2 }));
  });
});
