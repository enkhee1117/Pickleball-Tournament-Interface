import { describe, expect, it } from 'vitest';
import { generateRoundRobinDrafts, normalizeWhatsAppUrl } from '@/lib/tournaments';

describe('normalizeWhatsAppUrl', () => {
  it('returns null for empty values', () => {
    expect(normalizeWhatsAppUrl('')).toBeNull();
    expect(normalizeWhatsAppUrl('   ')).toBeNull();
  });

  it('accepts full whatsapp invite urls', () => {
    expect(normalizeWhatsAppUrl('https://chat.whatsapp.com/ABCDE')).toBe(
      'https://chat.whatsapp.com/ABCDE',
    );
  });

  it('normalizes host-only whatsapp invite urls', () => {
    expect(normalizeWhatsAppUrl('chat.whatsapp.com/ABCDE')).toBe(
      'https://chat.whatsapp.com/ABCDE',
    );
  });

  it('rejects non-whatsapp links', () => {
    expect(normalizeWhatsAppUrl('https://example.com/invite')).toBeNull();
  });
});

describe('generateRoundRobinDrafts', () => {
  it('returns empty drafts when less than two players', () => {
    expect(generateRoundRobinDrafts([])).toEqual([]);
    expect(generateRoundRobinDrafts(['Alice'])).toEqual([]);
  });

  it('generates n*(n-1)/2 matches', () => {
    const players = ['A', 'B', 'C', 'D'];
    const drafts = generateRoundRobinDrafts(players);
    expect(drafts).toHaveLength(6);
  });

  it('contains all unique pairings exactly once', () => {
    const drafts = generateRoundRobinDrafts(['A', 'B', 'C']);
    const pairSet = new Set(drafts.map((d) => `${d.team_a_label}:${d.team_b_label}`));
    expect(pairSet).toEqual(new Set(['A:B', 'A:C', 'B:C']));
  });

  it('assigns rotating courts from 1 to 4', () => {
    const drafts = generateRoundRobinDrafts(['A', 'B', 'C', 'D', 'E']);
    const courts = drafts.slice(0, 8).map((d) => d.court_label);
    expect(courts).toEqual([
      'Court 1',
      'Court 2',
      'Court 3',
      'Court 4',
      'Court 1',
      'Court 2',
      'Court 3',
      'Court 4',
    ]);
  });
});
