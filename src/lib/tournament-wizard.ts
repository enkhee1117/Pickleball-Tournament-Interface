// Pure mapping logic shared by the create-tournament wizard and its server
// action. Kept dependency-free so it can be unit-tested without spinning up
// Supabase.

import type { MatchScheme } from '@/lib/match-schemes';

export type WizardFormat = 'rr-mixed' | 'rr-same' | 'fp-mixed' | 'fp-same';
export type WizardPairing = 'balanced' | 'random' | 'snake' | 'manual';

// What the DB stores in tournaments.format. Older code still passes raw db
// values through this module, so we accept both.
export type DbFormat = 'round_robin' | 'fixed_partners' | 'bracket';

const DB_FORMATS: ReadonlySet<string> = new Set<DbFormat>([
  'round_robin',
  'fixed_partners',
  'bracket',
]);

export function isWizardFormat(value: string): value is WizardFormat {
  return value === 'rr-mixed' || value === 'rr-same' || value === 'fp-mixed' || value === 'fp-same';
}

export function dbFormat(format: WizardFormat | DbFormat | string): DbFormat {
  if (format === 'fp-mixed' || format === 'fp-same' || format === 'fixed_partners') {
    return 'fixed_partners';
  }
  if (format === 'bracket') return 'bracket';
  if (DB_FORMATS.has(format) || isWizardFormat(format)) {
    return 'round_robin';
  }
  return 'round_robin';
}

export function isFixedPartners(format: WizardFormat | DbFormat | string): boolean {
  return dbFormat(format) === 'fixed_partners';
}

// Which generation scheme to feed into generateMatchDrafts.
export function pickScheme(format: WizardFormat | DbFormat | string): MatchScheme {
  if (dbFormat(format) === 'fixed_partners') return 'fixed_partners';
  return 'rotating_partners';
}

// True only for the explicit "I'll set teams" path on a fixed-partners draw.
// Round-robin always auto-generates; fixed-partners with auto-pair / random
// does too — only the manual choice hands off to the roster screen.
export function shouldAutoGenerate(
  format: WizardFormat | DbFormat | string,
  pairing: WizardPairing | undefined,
): boolean {
  if (isFixedPartners(format) && pairing === 'manual') return false;
  return true;
}

// Pairing options vary by format. The wizard uses this to reset the
// selection when the format flips between RR and FP.
export function pairingOptionsForFormat(format: WizardFormat | DbFormat | string): WizardPairing[] {
  return isFixedPartners(format)
    ? ['manual', 'balanced', 'random']
    : ['balanced', 'random', 'snake'];
}

export function defaultPairingForFormat(format: WizardFormat | DbFormat | string): WizardPairing {
  return pairingOptionsForFormat(format)[0];
}

export function isValidPairingForFormat(
  format: WizardFormat | DbFormat | string,
  pairing: WizardPairing,
): boolean {
  return pairingOptionsForFormat(format).includes(pairing);
}

// Whether the configured (scheme, roster size) combination can actually
// produce a schedule. Round-robin needs >= 4. Fixed-partners needs an even
// count (each team is two players).
export function canGenerateMatches(
  format: WizardFormat | DbFormat | string,
  playerCount: number,
): boolean {
  if (playerCount < 4) return false;
  if (pickScheme(format) === 'fixed_partners' && playerCount % 2 !== 0) return false;
  return true;
}
