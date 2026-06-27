import { describe, expect, it } from 'vitest';
import {
  normalizeWhatsAppUrl,
  validateEmail,
  validateMatchScore,
  validateOptionalEmail,
  validatePassword,
  validatePlayerCount,
  validatePlayerName,
  validateTournamentFormat,
  validateTournamentName,
  validateWhatsAppUrl,
} from '@/lib/validation';

describe('validateTournamentName', () => {
  it('accepts 3-120 char names', () => {
    expect(validateTournamentName('Spring Open').ok).toBe(true);
    expect(validateTournamentName('a'.repeat(120)).ok).toBe(true);
  });
  it('rejects too short', () => {
    expect(validateTournamentName('  hi ').ok).toBe(false);
  });
  it('rejects too long', () => {
    expect(validateTournamentName('a'.repeat(121)).ok).toBe(false);
  });
  it('trims before validating', () => {
    expect(validateTournamentName('   Spring   ').ok).toBe(true);
  });
});

describe('validateTournamentFormat', () => {
  it('accepts known formats', () => {
    for (const f of ['round_robin', 'fixed_partners', 'bracket', 'partner_mixer']) {
      expect(validateTournamentFormat(f).ok).toBe(true);
    }
  });
  it('rejects unknown', () => {
    expect(validateTournamentFormat('swiss').ok).toBe(false);
    expect(validateTournamentFormat('').ok).toBe(false);
  });
});

describe('validatePlayerName', () => {
  it('accepts 2-120 char names', () => {
    expect(validatePlayerName('Jo').ok).toBe(true);
    expect(validatePlayerName('Joanna Smith').ok).toBe(true);
  });
  it('rejects too short', () => {
    expect(validatePlayerName('a').ok).toBe(false);
    expect(validatePlayerName(' ').ok).toBe(false);
  });
});

describe('validateEmail / validateOptionalEmail', () => {
  it('accepts well-formed addresses', () => {
    expect(validateEmail('a@b.co').ok).toBe(true);
    expect(validateOptionalEmail('a@b.co').ok).toBe(true);
  });
  it('rejects bad addresses', () => {
    expect(validateEmail('').ok).toBe(false);
    expect(validateEmail('not-an-email').ok).toBe(false);
    expect(validateEmail('a@b').ok).toBe(false);
    expect(validateOptionalEmail('@nope').ok).toBe(false);
  });
  it('treats blank optional email as ok', () => {
    expect(validateOptionalEmail('').ok).toBe(true);
    expect(validateOptionalEmail('   ').ok).toBe(true);
  });
});

describe('validatePassword', () => {
  it('rejects under 8 chars', () => {
    expect(validatePassword('short').ok).toBe(false);
  });
  it('accepts 8+ chars', () => {
    expect(validatePassword('longenough').ok).toBe(true);
  });
});

describe('validatePlayerCount', () => {
  it('accepts whole numbers in range', () => {
    expect(validatePlayerCount(0).ok).toBe(true);
    expect(validatePlayerCount(8).ok).toBe(true);
    expect(validatePlayerCount(64).ok).toBe(true);
  });
  it('rejects fractional or out-of-range', () => {
    expect(validatePlayerCount(-1).ok).toBe(false);
    expect(validatePlayerCount(65).ok).toBe(false);
    expect(validatePlayerCount(3.5).ok).toBe(false);
    expect(validatePlayerCount('abc').ok).toBe(false);
  });
});

describe('normalizeWhatsAppUrl / validateWhatsAppUrl', () => {
  it('returns null for blanks', () => {
    expect(normalizeWhatsAppUrl('')).toBeNull();
    expect(normalizeWhatsAppUrl('   ')).toBeNull();
  });
  it('keeps valid invite urls', () => {
    expect(normalizeWhatsAppUrl('https://chat.whatsapp.com/ABC')).toBe(
      'https://chat.whatsapp.com/ABC',
    );
  });
  it('prepends https:// for host-only invites', () => {
    expect(normalizeWhatsAppUrl('chat.whatsapp.com/ABC')).toBe(
      'https://chat.whatsapp.com/ABC',
    );
  });
  it('rejects non-WhatsApp links via validate', () => {
    expect(validateWhatsAppUrl('https://example.com/x').ok).toBe(false);
  });
  it('treats blank as ok in validate', () => {
    expect(validateWhatsAppUrl('').ok).toBe(true);
  });
});

describe('validateMatchScore', () => {
  it('accepts blanks (clearing)', () => {
    expect(validateMatchScore('').ok).toBe(true);
    expect(validateMatchScore(null).ok).toBe(true);
  });
  it('accepts non-negative integers', () => {
    expect(validateMatchScore(0).ok).toBe(true);
    expect(validateMatchScore(11).ok).toBe(true);
  });
  it('rejects negatives, fractional, NaN, or absurdly high', () => {
    expect(validateMatchScore(-1).ok).toBe(false);
    expect(validateMatchScore(1.5).ok).toBe(false);
    expect(validateMatchScore('abc').ok).toBe(false);
    expect(validateMatchScore(1000).ok).toBe(false);
  });
});
