export type Validation =
  | { ok: true }
  | { ok: false; error: string };

export function validateTournamentName(raw: string): Validation {
  const v = raw.trim();
  if (v.length < 3) return { ok: false, error: 'Tournament name must be at least 3 characters.' };
  if (v.length > 120) return { ok: false, error: 'Tournament name must be at most 120 characters.' };
  return { ok: true };
}

export function validateTournamentFormat(raw: string): Validation {
  if (raw === 'round_robin' || raw === 'fixed_partners' || raw === 'bracket' || raw === 'partner_mixer') return { ok: true };
  return { ok: false, error: 'Pick a tournament format.' };
}

export function validatePlayerName(raw: string): Validation {
  const v = raw.trim();
  if (v.length < 2) return { ok: false, error: 'Player name must be at least 2 characters.' };
  if (v.length > 120) return { ok: false, error: 'Player name must be at most 120 characters.' };
  return { ok: true };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(raw: string): Validation {
  const v = raw.trim();
  if (!v) return { ok: false, error: 'Email is required.' };
  if (!EMAIL_RE.test(v)) return { ok: false, error: 'Please enter a valid email address.' };
  return { ok: true };
}

export function validateOptionalEmail(raw: string): Validation {
  const v = raw.trim();
  if (!v) return { ok: true };
  if (!EMAIL_RE.test(v)) return { ok: false, error: 'Please enter a valid email address.' };
  return { ok: true };
}

export function validatePassword(raw: string): Validation {
  if (raw.length < 8) return { ok: false, error: 'Password must be at least 8 characters.' };
  if (raw.length > 200) return { ok: false, error: 'Password is too long.' };
  return { ok: true };
}

export function validatePlayerCount(raw: string | number): Validation {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return { ok: false, error: 'Number of players must be a number.' };
  if (n < 0) return { ok: false, error: 'Number of players cannot be negative.' };
  if (n > 64) return { ok: false, error: 'Number of players is capped at 64.' };
  if (!Number.isInteger(n)) return { ok: false, error: 'Number of players must be a whole number.' };
  return { ok: true };
}

const WHATSAPP_PREFIX = 'https://chat.whatsapp.com/';

export function normalizeWhatsAppUrl(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (v.startsWith(WHATSAPP_PREFIX)) return v;
  if (v.startsWith('chat.whatsapp.com/')) return `https://${v}`;
  return null;
}

export function validateWhatsAppUrl(raw: string): Validation {
  const v = raw.trim();
  if (!v) return { ok: true };
  if (normalizeWhatsAppUrl(v)) return { ok: true };
  return { ok: false, error: 'WhatsApp link must start with chat.whatsapp.com/' };
}

export function validateMatchScore(raw: string | number | null): Validation {
  if (raw === null || raw === '') return { ok: true };
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return { ok: false, error: 'Score must be a number.' };
  if (!Number.isInteger(n)) return { ok: false, error: 'Score must be a whole number.' };
  if (n < 0) return { ok: false, error: 'Score cannot be negative.' };
  if (n > 999) return { ok: false, error: 'Score is implausibly high.' };
  return { ok: true };
}
