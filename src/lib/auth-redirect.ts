// Validate redirect targets coming from ?next= or form fields. Reject
// anything that's not a same-origin path: missing leading slash, empty, or
// protocol-relative ("//evil.com" which the browser resolves to a different
// host). Same logic that login + signup actions use; centralized so the
// auth/confirm route picks it up too.
export function safeNext(raw: string | null | undefined): string {
  const value = (raw ?? '').trim();
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}
