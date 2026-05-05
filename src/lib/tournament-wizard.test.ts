import { describe, expect, it } from 'vitest';
import {
  canGenerateMatches,
  dbFormat,
  defaultPairingForFormat,
  isFixedPartners,
  isValidPairingForFormat,
  isWizardFormat,
  pairingOptionsForFormat,
  pickScheme,
  shouldAutoGenerate,
  type WizardFormat,
  type WizardPairing,
} from '@/lib/tournament-wizard';
import { generateMatchDrafts } from '@/lib/match-schemes';

const ALL_FORMATS: WizardFormat[] = ['rr-mixed', 'rr-same', 'fp-mixed', 'fp-same'];
const RR_PAIRINGS: WizardPairing[] = ['balanced', 'random', 'snake'];
const FP_PAIRINGS: WizardPairing[] = ['manual', 'balanced', 'random'];

describe('isWizardFormat', () => {
  it('accepts the four UI format ids', () => {
    for (const f of ALL_FORMATS) expect(isWizardFormat(f)).toBe(true);
  });

  it('rejects DB formats and arbitrary strings', () => {
    expect(isWizardFormat('round_robin')).toBe(false);
    expect(isWizardFormat('fixed_partners')).toBe(false);
    expect(isWizardFormat('whatever')).toBe(false);
  });
});

describe('dbFormat', () => {
  it('maps round-robin variants to round_robin', () => {
    expect(dbFormat('rr-mixed')).toBe('round_robin');
    expect(dbFormat('rr-same')).toBe('round_robin');
    expect(dbFormat('round_robin')).toBe('round_robin');
  });

  it('maps fixed-partners variants to fixed_partners', () => {
    expect(dbFormat('fp-mixed')).toBe('fixed_partners');
    expect(dbFormat('fp-same')).toBe('fixed_partners');
    expect(dbFormat('fixed_partners')).toBe('fixed_partners');
  });

  it('passes through bracket and falls back to round_robin for unknowns', () => {
    expect(dbFormat('bracket')).toBe('bracket');
    expect(dbFormat('something-else')).toBe('round_robin');
  });
});

describe('isFixedPartners', () => {
  it('matches both UI and DB fixed-partners labels', () => {
    expect(isFixedPartners('fp-mixed')).toBe(true);
    expect(isFixedPartners('fp-same')).toBe(true);
    expect(isFixedPartners('fixed_partners')).toBe(true);
    expect(isFixedPartners('rr-mixed')).toBe(false);
    expect(isFixedPartners('round_robin')).toBe(false);
  });
});

describe('pickScheme', () => {
  it('picks rotating_partners for RR formats', () => {
    expect(pickScheme('rr-mixed')).toBe('rotating_partners');
    expect(pickScheme('rr-same')).toBe('rotating_partners');
    expect(pickScheme('round_robin')).toBe('rotating_partners');
  });

  it('picks fixed_partners for FP formats', () => {
    expect(pickScheme('fp-mixed')).toBe('fixed_partners');
    expect(pickScheme('fp-same')).toBe('fixed_partners');
    expect(pickScheme('fixed_partners')).toBe('fixed_partners');
  });
});

describe('shouldAutoGenerate', () => {
  it('always auto-generates for round-robin regardless of pairing', () => {
    for (const p of RR_PAIRINGS) {
      expect(shouldAutoGenerate('rr-mixed', p)).toBe(true);
      expect(shouldAutoGenerate('rr-same', p)).toBe(true);
    }
  });

  it('skips auto-generation only for fixed-partners + manual', () => {
    expect(shouldAutoGenerate('fp-mixed', 'manual')).toBe(false);
    expect(shouldAutoGenerate('fp-same', 'manual')).toBe(false);
    expect(shouldAutoGenerate('fp-mixed', 'balanced')).toBe(true);
    expect(shouldAutoGenerate('fp-same', 'random')).toBe(true);
  });

  it('treats undefined pairing as auto-generate', () => {
    expect(shouldAutoGenerate('rr-mixed', undefined)).toBe(true);
    expect(shouldAutoGenerate('fp-mixed', undefined)).toBe(true);
  });
});

describe('pairingOptionsForFormat & defaultPairingForFormat', () => {
  it('exposes the RR pairing palette for RR formats', () => {
    for (const f of ['rr-mixed', 'rr-same'] as const) {
      expect(pairingOptionsForFormat(f)).toEqual(RR_PAIRINGS);
      expect(defaultPairingForFormat(f)).toBe('balanced');
    }
  });

  it('exposes the FP pairing palette for FP formats with manual as the default', () => {
    for (const f of ['fp-mixed', 'fp-same'] as const) {
      expect(pairingOptionsForFormat(f)).toEqual(FP_PAIRINGS);
      expect(defaultPairingForFormat(f)).toBe('manual');
    }
  });
});

describe('isValidPairingForFormat', () => {
  it('flags wrong-format pairings so the wizard can reset on format change', () => {
    expect(isValidPairingForFormat('rr-mixed', 'manual')).toBe(false);
    expect(isValidPairingForFormat('rr-mixed', 'balanced')).toBe(true);
    expect(isValidPairingForFormat('fp-mixed', 'snake')).toBe(false);
    expect(isValidPairingForFormat('fp-mixed', 'manual')).toBe(true);
  });
});

describe('canGenerateMatches', () => {
  it('rejects rosters smaller than 4', () => {
    for (const f of ALL_FORMATS) {
      expect(canGenerateMatches(f, 0)).toBe(false);
      expect(canGenerateMatches(f, 3)).toBe(false);
    }
  });

  it('accepts any size >= 4 for round-robin', () => {
    for (const f of ['rr-mixed', 'rr-same'] as const) {
      expect(canGenerateMatches(f, 4)).toBe(true);
      expect(canGenerateMatches(f, 5)).toBe(true);
      expect(canGenerateMatches(f, 12)).toBe(true);
    }
  });

  it('requires an even count for fixed-partners', () => {
    for (const f of ['fp-mixed', 'fp-same'] as const) {
      expect(canGenerateMatches(f, 4)).toBe(true);
      expect(canGenerateMatches(f, 5)).toBe(false);
      expect(canGenerateMatches(f, 12)).toBe(true);
    }
  });
});

// End-to-end: every (format, pairing) the wizard can submit must either
// auto-generate a valid set of drafts or be a recognised manual handoff.
describe('full wizard scenario coverage', () => {
  const players = (n: number) => Array.from({ length: n }, (_, i) => `P${i + 1}`);

  for (const format of ALL_FORMATS) {
    const pairings = pairingOptionsForFormat(format);
    for (const pairing of pairings) {
      it(`${format} + ${pairing}`, () => {
        if (!shouldAutoGenerate(format, pairing)) {
          expect(format.startsWith('fp')).toBe(true);
          expect(pairing).toBe('manual');
          return;
        }
        const scheme = pickScheme(format);
        const playerCount = format.startsWith('fp') ? 8 : 8; // even for both
        expect(canGenerateMatches(format, playerCount)).toBe(true);
        const drafts =
          scheme === 'rotating_partners'
            ? generateMatchDrafts({
                scheme,
                players: players(playerCount),
                rounds: 3,
                courts: 2,
              })
            : generateMatchDrafts({ scheme, players: players(playerCount), courts: 2 });
        expect(drafts.length).toBeGreaterThan(0);
        for (const d of drafts) {
          expect(d.team_a_label).toMatch(/ & /);
          expect(d.team_b_label).toMatch(/ & /);
        }
      });
    }
  }
});
