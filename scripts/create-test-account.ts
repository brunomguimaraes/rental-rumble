/**
 * Create (or reset) a verified test account for local testing, writing directly
 * to the same Turso/libSQL database the dev server uses. No email verification
 * step — the row is inserted with email_verified=1 and a real scrypt hash, so
 * you can sign in immediately at the login screen.
 *
 *   npx --yes tsx scripts/create-test-account.ts
 *   npx --yes tsx scripts/create-test-account.ts you@example.com hunter2 "My Name"
 *
 * Env is loaded the same way `scripts/dev-api.ts` loads it (.env.local first,
 * then .env, without overriding), so it targets the exact DB the app reads.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getDb, newId, readUserByEmail } from '../api/_db.js';
import { hashPassword } from '../api/_session.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

/** Load KEY=VALUE pairs from an env file into process.env (without overriding). */
function loadEnvFile(name: string): void {
  const path = join(root, name);
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 0) continue;
    const key = t.slice(0, eq).trim();
    if (process.env[key]) continue;
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}
loadEnvFile('.env.local');
loadEnvFile('.env');

const email = process.argv[2] ?? 'test@rental.local';
const password = process.argv[3] ?? 'test1234';
const displayName = process.argv[4] ?? 'Tester';
const emailLower = email.toLowerCase();

const db = getDb();
if (!db) {
  console.error(
    'No database configured. Set TURSO_DATABASE_URL (a libsql:// URL, or ' +
      'file:local.db for offline dev) in .env.local or .env, then run ' +
      '`npm run db:setup` first.',
  );
  process.exit(1);
}

const passwordHash = hashPassword(password);
const existing = await readUserByEmail(db, emailLower);

if (existing) {
  // Reset the password + mark verified so a re-run always yields working creds.
  await db.execute({
    sql: 'update users set password_hash = ?, email_verified = 1, display_name = ? where id = ?',
    args: [passwordHash, displayName, existing.id],
  });
  console.log(`✓ Reset existing account (${email}).`);
} else {
  await db.execute({
    sql: `insert into users (id, email, email_lower, display_name, password_hash, email_verified, created_at, runs, wins, losses)
          values (?, ?, ?, ?, ?, 1, ?, 0, 0, 0)`,
    args: [newId(), email, emailLower, displayName, passwordHash, Date.now()],
  });
  console.log(`✓ Created account (${email}).`);
}

console.log('\n  Login with:');
console.log(`    email:    ${email}`);
console.log(`    password: ${password}`);
console.log('\n  Start the app with `npm run dev:local` and sign in.');
