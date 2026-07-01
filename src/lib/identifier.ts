import { normalizeE164, phoneToSynthEmail } from './phone';

// Login identifiers can be either an email or a phone number. This helper
// centralizes the routing so the login/signup/reset actions all agree on
// how to interpret whatever the user typed.
//
// Rule: if the string looks like an email (has "@" with a valid-ish shape),
// treat it as one. Otherwise try to normalize it as an E.164 phone and route
// through the synth-email trick from lib/phone.ts so it plays nicely with
// Supabase's email/password provider.

export type ResolvedIdentifier =
  | { kind: 'email'; email: string; phone: null }
  | { kind: 'phone'; email: string; phone: string };

export function isEmailShaped(input: string): boolean {
  const trimmed = input.trim();
  // Minimal shape check. Real validation happens server-side inside Supabase;
  // this is only for routing between the email path and the phone path.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

export function resolveIdentifier(input: string): ResolvedIdentifier | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (isEmailShaped(trimmed)) {
    return { kind: 'email', email: trimmed.toLowerCase(), phone: null };
  }
  const phone = normalizeE164(trimmed);
  if (!phone) return null;
  return { kind: 'phone', email: phoneToSynthEmail(phone), phone };
}
