#!/usr/bin/env node
// Apply a Supabase migration (or run a read-only check) against the Try to Dink
// project via the Management API — the consistent no-MCP path for this repo.
//
// There is no DB password on file; the Management API runs SQL as `postgres`
// (full DDL) authed with the Supabase CLI personal-access token. The token is
// read from $SUPABASE_ACCESS_TOKEN, else the macOS keychain (the CLI stores it
// under service "Supabase CLI"). The project ref is derived from
// NEXT_PUBLIC_SUPABASE_URL in .env.local (or $SUPABASE_PROJECT_REF).
//
// Usage:
//   node scripts/db-apply.mjs supabase/migrations/00XX_name.sql   # apply one file
//   node scripts/db-apply.mjs --status                            # repo files vs recorded
//   node scripts/db-apply.mjs --query "select 1"                  # ad-hoc read
//
// NOTE: schema_migrations on this project is unreliable (historically drifted).
// After applying, verify the actual object (to_regprocedure / columns), not the
// tracking table. --status is informational only.

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations');

function readEnvLocal() {
  try {
    return Object.fromEntries(
      readFileSync(join(ROOT, '.env.local'), 'utf8')
        .split('\n')
        .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
        .map((l) => {
          const i = l.indexOf('=');
          return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
        }),
    );
  } catch {
    return {};
  }
}

function projectRef(env) {
  if (process.env.SUPABASE_PROJECT_REF) return process.env.SUPABASE_PROJECT_REF;
  const url = env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const m = url.match(/https:\/\/([a-z0-9]+)\.supabase\.co/i);
  if (!m) throw new Error('Could not derive project ref (set SUPABASE_PROJECT_REF or NEXT_PUBLIC_SUPABASE_URL in .env.local)');
  return m[1];
}

function accessToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN.trim();
  try {
    return execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-w'], { encoding: 'utf8' }).trim();
  } catch {
    throw new Error('No token: set $SUPABASE_ACCESS_TOKEN or store the Supabase CLI token in the macOS keychain.');
  }
}

async function runSql(ref, token, sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  if (!res.ok) {
    const msg = body && typeof body === 'object' ? body.message ?? JSON.stringify(body) : String(body);
    throw new Error(`Management API ${res.status}: ${msg}`);
  }
  return body;
}

function repoMigrationNumbers() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => ({ file: f, num: (f.match(/^(\d+)/) ?? [])[1] }))
    .sort((a, b) => a.file.localeCompare(b.file));
}

async function main() {
  const env = readEnvLocal();
  const ref = projectRef(env);
  const token = accessToken();
  const arg = process.argv[2];

  if (!arg) {
    console.error('usage: node scripts/db-apply.mjs <file.sql | --status | --query "SQL">');
    process.exit(1);
  }

  if (arg === '--status') {
    const recorded = await runSql(ref, token, 'select version from supabase_migrations.schema_migrations order by version');
    const recordedSet = new Set((Array.isArray(recorded) ? recorded : []).map((r) => String(r.version)));
    console.log(`project: ${ref}`);
    console.log('(schema_migrations is unreliable on this project — verify objects, not this list)\n');
    for (const { file, num } of repoMigrationNumbers()) {
      console.log(`${recordedSet.has(num) ? 'recorded ' : 'MISSING  '} ${file}`);
    }
    return;
  }

  if (arg === '--query') {
    const out = await runSql(ref, token, process.argv[3] ?? '');
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  // Apply a migration file.
  const sql = readFileSync(arg, 'utf8');
  console.log(`applying ${basename(arg)} to ${ref} …`);
  await runSql(ref, token, sql);
  console.log(`✓ applied ${basename(arg)}`);
  console.log('  (verify the object it defines — schema_migrations is not trustworthy here)');
}

main().catch((err) => {
  console.error(`✗ ${err.message}`);
  process.exit(1);
});
