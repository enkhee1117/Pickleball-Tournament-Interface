// Mirror the alphabet used by gen_tournament_invite_code() in Postgres.
// We exclude look-alikes (I, O, 0, 1) so codes shouted across the court don't
// get mistyped. Keep this in sync with supabase/migrations/0010_invite_codes.sql.
export const INVITE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const INVITE_CODE_LENGTH = 6;

const VALID_CHAR_RE = new RegExp(`^[${INVITE_CODE_ALPHABET}]+$`);

// Strip non-alphanumerics, uppercase, and clip to the first six characters.
// Useful both for parsing what the user typed and for matching against the DB.
export function normalizeInviteCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, INVITE_CODE_LENGTH);
}

export function isValidInviteCode(code: string): boolean {
  return code.length === INVITE_CODE_LENGTH && VALID_CHAR_RE.test(code);
}

// Render an invite code as a human-friendly XXX-XXX string. Accepts either
// already-formatted ("ABC-123") or raw ("ABC123") input.
export function formatInviteCode(code: string): string {
  const normalized = normalizeInviteCode(code);
  if (normalized.length !== INVITE_CODE_LENGTH) return normalized;
  return `${normalized.slice(0, 3)}-${normalized.slice(3)}`;
}

// Deterministic-rng-friendly generator used by tests.
export function generateInviteCode(rng: () => number = Math.random): string {
  let out = '';
  for (let i = 0; i < INVITE_CODE_LENGTH; i += 1) {
    const idx = Math.floor(rng() * INVITE_CODE_ALPHABET.length);
    out += INVITE_CODE_ALPHABET[idx];
  }
  return out;
}
