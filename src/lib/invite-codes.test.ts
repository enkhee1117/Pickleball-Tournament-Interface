import { describe, expect, it } from 'vitest';
import {
  INVITE_CODE_ALPHABET,
  INVITE_CODE_LENGTH,
  formatInviteCode,
  generateInviteCode,
  isValidInviteCode,
  normalizeInviteCode,
} from '@/lib/invite-codes';

describe('normalizeInviteCode', () => {
  it('uppercases and strips dashes / spaces', () => {
    expect(normalizeInviteCode('abc-234')).toBe('ABC234');
    expect(normalizeInviteCode('  abc 234 ')).toBe('ABC234');
  });

  it('drops non-alphanumeric characters', () => {
    expect(normalizeInviteCode('A!B@C#2$3%4')).toBe('ABC234');
  });

  it('truncates to the canonical length', () => {
    expect(normalizeInviteCode('ABCDEFGHIJ')).toHaveLength(INVITE_CODE_LENGTH);
    expect(normalizeInviteCode('ABCDEFGHIJ')).toBe('ABCDEF');
  });

  it('returns an empty string for empty input', () => {
    expect(normalizeInviteCode('')).toBe('');
  });
});

describe('isValidInviteCode', () => {
  it('accepts canonical 6-char codes from the safe alphabet', () => {
    expect(isValidInviteCode('ABC234')).toBe(true);
    expect(isValidInviteCode('Z9PQRT')).toBe(true);
  });

  it('rejects look-alike characters that the generator excludes', () => {
    // I, O, 0, 1 are deliberately omitted from INVITE_CODE_ALPHABET so they
    // can't be confused over the phone.
    expect(isValidInviteCode('ABCIO0')).toBe(false);
    expect(isValidInviteCode('ABCDE1')).toBe(false);
  });

  it('rejects wrong length, lowercase, or non-alphanumeric input', () => {
    expect(isValidInviteCode('ABC23')).toBe(false);
    expect(isValidInviteCode('abc234')).toBe(false);
    expect(isValidInviteCode('ABC-23')).toBe(false);
    expect(isValidInviteCode('')).toBe(false);
  });
});

describe('formatInviteCode', () => {
  it('inserts a dash in the middle of a canonical 6-char code', () => {
    expect(formatInviteCode('ABC234')).toBe('ABC-234');
  });

  it('round-trips through normalize so already-formatted input works', () => {
    expect(formatInviteCode('abc-234')).toBe('ABC-234');
    expect(formatInviteCode('  ABC 234 ')).toBe('ABC-234');
  });

  it('returns the partial code unchanged when it is too short', () => {
    expect(formatInviteCode('AB')).toBe('AB');
    expect(formatInviteCode('')).toBe('');
  });
});

describe('generateInviteCode', () => {
  it('returns codes of the canonical length using only the safe alphabet', () => {
    const code = generateInviteCode();
    expect(code).toHaveLength(INVITE_CODE_LENGTH);
    for (const ch of code) {
      expect(INVITE_CODE_ALPHABET).toContain(ch);
    }
  });

  it('is deterministic when given a seeded rng', () => {
    let s = 42;
    const rng = () => {
      s = (s * 1664525 + 1013904223) % 0x100000000;
      return s / 0x100000000;
    };
    let s2 = 42;
    const rng2 = () => {
      s2 = (s2 * 1664525 + 1013904223) % 0x100000000;
      return s2 / 0x100000000;
    };
    expect(generateInviteCode(rng)).toBe(generateInviteCode(rng2));
  });

  it('produces values that pass isValidInviteCode', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(isValidInviteCode(generateInviteCode())).toBe(true);
    }
  });
});
