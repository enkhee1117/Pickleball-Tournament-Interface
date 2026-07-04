import { describe, expect, it } from 'vitest';
import { GENDER_OPTIONS, SKILL_LEVELS, duprForSkill, normalizeGender } from './quick-join';

describe('duprForSkill', () => {
  it('maps each declared skill band to a mid-band DUPR', () => {
    expect(duprForSkill('new')).toBe(2.75);
    expect(duprForSkill('mid')).toBe(3.25);
    expect(duprForSkill('high')).toBe(4.25);
  });

  it('returns null for unknown or empty input', () => {
    expect(duprForSkill('')).toBeNull();
    expect(duprForSkill('pro')).toBeNull();
    expect(duprForSkill('MID')).toBeNull(); // case-sensitive by design
  });

  it('keeps every band inside the DB dupr check constraint (2..8)', () => {
    for (const s of SKILL_LEVELS) {
      expect(s.dupr).toBeGreaterThanOrEqual(2);
      expect(s.dupr).toBeLessThanOrEqual(8);
    }
  });
});

describe('normalizeGender', () => {
  it('passes through the three valid values', () => {
    expect(normalizeGender('m')).toBe('m');
    expect(normalizeGender('f')).toBe('f');
    expect(normalizeGender('x')).toBe('x');
  });

  it('collapses anything else to null so the DB check never trips', () => {
    expect(normalizeGender('')).toBeNull();
    expect(normalizeGender('male')).toBeNull();
    expect(normalizeGender('M')).toBeNull();
    expect(normalizeGender(null)).toBeNull();
    expect(normalizeGender(undefined)).toBeNull();
  });

  it('GENDER_OPTIONS values all survive normalization', () => {
    for (const g of GENDER_OPTIONS) {
      expect(normalizeGender(g.value)).toBe(g.value);
    }
  });
});
