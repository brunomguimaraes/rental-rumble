/**
 * Apply db/schema.sql to the Turso (libSQL) database. Idempotent — every
 * statement is `create ... if not exists`, so it's safe to run repeatedly.
 *
 *   npm run db:setup
 *
 * Reads TURSO_DATABASE_URL (+ optional TURSO_AUTH_TOKEN) from the environment,
 * falling back to a minimal parse of .env.local / .env (the same files
 * `vercel dev` uses). A local file URL works too, e.g. TURSO_DATABASE_URL=file:local.db
 */
import { createClient } from '@libsql/client';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

/** Load KEY=VALUE pairs from an env file into process.env (without overriding). */
function loadEnvFile(name: string): void {
  const path = join(root, name);
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key]) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvFile('.env.local');
loadEnvFile('.env');

const url = process.env.TURSO_DATABASE_URL;
if (!url) {
  console.error(
    'TURSO_DATABASE_URL is not set. Add it to .env.local (Turso → DB URL) or pass ' +
      'it inline: TURSO_DATABASE_URL=... npm run db:setup  (file:local.db works for local dev).',
  );
  process.exit(1);
}

const authToken = process.env.TURSO_AUTH_TOKEN;
const client = createClient(authToken ? { url, authToken } : { url });
const schema = readFileSync(join(root, 'db', 'schema.sql'), 'utf8');

// libSQL runs a multi-statement script in one call.
await client.executeMultiple(schema);
console.log('✓ Schema applied.');
