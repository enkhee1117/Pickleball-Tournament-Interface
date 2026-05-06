// E.164 phone normalization. Accepts a fairly forgiving user-entered string
// (with parens, dashes, spaces) and returns a +CCNNNN string when it looks
// valid, or null when it's clearly not a phone number.
//
// We don't try to detect the country: callers must supply a leading + or a
// US-shaped 10-digit number (which we assume is +1).

export function normalizeE164(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) {
    const candidate = '+' + digits.slice(1).replace(/[^\d]/g, '');
    return /^\+[1-9]\d{6,14}$/.test(candidate) ? candidate : null;
  }
  // Bare 10 digits → assume +1 (US/CA).
  if (/^\d{10}$/.test(digits)) return '+1' + digits;
  // Bare 11 digits starting with 1 → strip and prepend +.
  if (/^1\d{10}$/.test(digits)) return '+' + digits;
  return null;
}

// Pretty-print an E.164 string for display. Splits +1 numbers into
// "+1 555 123 4567"; everything else becomes "+CC NNNN…".
export function formatE164(phone: string | null | undefined): string {
  if (!phone) return '';
  if (/^\+1\d{10}$/.test(phone)) {
    return `+1 ${phone.slice(2, 5)} ${phone.slice(5, 8)} ${phone.slice(8)}`;
  }
  return phone;
}

// Build an `sms:` URL with a prefilled body. The `?body=` form works on iOS
// (13+) and Android; older iOS needs `&body=`. There's no perfect polyglot,
// but `?body=` is the de-facto standard now.
export function buildSmsUrl(phone: string, body: string): string {
  return `sms:${encodeURIComponent(phone)}?body=${encodeURIComponent(body)}`;
}

// Workaround for projects that have phone signups/logins disabled in the
// Supabase dashboard: derive a deterministic synthetic email from the
// caller's phone, then use email-based auth. The synthetic email is purely
// internal — users never type it.
export function phoneToSynthEmail(phone: string): string {
  const digits = phone.replace(/^\+/, '').replace(/\D/g, '');
  return `${digits}@phone.local`;
}
