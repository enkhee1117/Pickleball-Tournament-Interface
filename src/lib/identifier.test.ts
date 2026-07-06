import { describe, expect, it } from 'vitest';
import { isEmailShaped, resolveEmailIdentifier, resolveIdentifier } from './identifier';

describe('isEmailShaped', () => {
  it('accepts a normal email', () => {
    expect(isEmailShaped('alice@example.com')).toBe(true);
  });
  it('accepts email with plus tag', () => {
    expect(isEmailShaped('alice+mixer@example.com')).toBe(true);
  });
  it('rejects missing tld', () => {
    expect(isEmailShaped('alice@example')).toBe(false);
  });
  it('rejects a phone', () => {
    expect(isEmailShaped('+15551234567')).toBe(false);
  });
  it('rejects whitespace inside', () => {
    expect(isEmailShaped('a lice@example.com')).toBe(false);
  });
});

describe('resolveIdentifier', () => {
  it('routes a real email to the email path', () => {
    const r = resolveIdentifier('ALICE@Example.com');
    expect(r).toEqual({ kind: 'email', email: 'alice@example.com', phone: null });
  });
  it('routes a formatted phone to the phone path via synth email', () => {
    const r = resolveIdentifier('+1 (555) 123-4567');
    expect(r).toEqual({ kind: 'phone', email: '15551234567@phone.local', phone: '+15551234567' });
  });
  it('routes a bare 10-digit US phone to the phone path', () => {
    const r = resolveIdentifier('5551234567');
    expect(r).toEqual({ kind: 'phone', email: '15551234567@phone.local', phone: '+15551234567' });
  });
  it('returns null for empty input', () => {
    expect(resolveIdentifier('   ')).toBe(null);
  });
  it('returns null for gibberish', () => {
    expect(resolveIdentifier('not an email or phone')).toBe(null);
  });
});

describe('resolveEmailIdentifier (auth is email-only)', () => {
  it('accepts a real email', () => {
    expect(resolveEmailIdentifier('ALICE@Example.com')).toEqual({ kind: 'email', email: 'alice@example.com', phone: null });
  });
  it('rejects a phone number', () => {
    expect(resolveEmailIdentifier('+1 (555) 123-4567')).toBe(null);
    expect(resolveEmailIdentifier('5551234567')).toBe(null);
  });
  it('rejects gibberish and empty', () => {
    expect(resolveEmailIdentifier('nope')).toBe(null);
    expect(resolveEmailIdentifier('   ')).toBe(null);
  });
});
