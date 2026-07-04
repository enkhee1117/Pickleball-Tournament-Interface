// Pure mapping logic for the cold-join quick profile (cold-join.html step 3).
// Kept dependency-free so it unit-tests without Supabase.

// Rough skill band → representative DUPR. Coarse on purpose; players refine
// later from their profile. Values sit mid-band so balanced pairing works.
export const SKILL_LEVELS = [
  { value: 'new', label: 'New', dupr: 2.75 },
  { value: 'mid', label: '3.0–3.5', dupr: 3.25 },
  { value: 'high', label: '4.0+', dupr: 4.25 },
] as const;

export type SkillLevel = (typeof SKILL_LEVELS)[number]['value'];

export function duprForSkill(skill: string): number | null {
  return SKILL_LEVELS.find((s) => s.value === skill)?.dupr ?? null;
}

export const GENDER_OPTIONS = [
  { value: 'm', label: 'Man' },
  { value: 'f', label: 'Woman' },
  { value: 'x', label: 'Skip' },
] as const;

export type QuickGender = (typeof GENDER_OPTIONS)[number]['value'];

// Anything unexpected collapses to null so the DB check constraint never trips.
export function normalizeGender(raw: string | null | undefined): QuickGender | null {
  return raw === 'm' || raw === 'f' || raw === 'x' ? raw : null;
}
