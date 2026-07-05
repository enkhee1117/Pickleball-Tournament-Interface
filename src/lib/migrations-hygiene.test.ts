import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

// Guards migration hygiene so the "two PRs both grabbed 0051" collision that
// derailed a merge can't recur. Runs in the normal `npm test` suite.

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

// The one historical collision, from before this guard existed: PR #104
// (draw precondition errors) and PR #106 (batch ballot) both merged as 0050.
// Both are applied in prod under their distinct names; renumbering an applied
// migration is riskier than documenting it. Any NEW collision must fail.
const KNOWN_DUPLICATE_PREFIXES = new Set(['0050']);

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
}

describe('supabase migrations hygiene', () => {
  it('every migration starts with a 4-digit numeric prefix', () => {
    const bad = migrationFiles().filter((f) => !/^\d{4}_/.test(f));
    expect(bad, `migrations must be NNNN_name.sql: ${bad.join(', ')}`).toEqual([]);
  });

  it('has no accidental duplicate migration numbers', () => {
    const byPrefix = new Map<string, string[]>();
    for (const f of migrationFiles()) {
      const prefix = f.slice(0, 4);
      byPrefix.set(prefix, [...(byPrefix.get(prefix) ?? []), f]);
    }
    const collisions = [...byPrefix.entries()]
      .filter(([prefix, files]) => files.length > 1 && !KNOWN_DUPLICATE_PREFIXES.has(prefix))
      .map(([prefix, files]) => `${prefix}: ${files.join(' + ')}`);
    expect(collisions, `duplicate migration numbers — bump one: ${collisions.join('; ')}`).toEqual([]);
  });
});
