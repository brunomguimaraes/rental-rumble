/**
 * Helpers for the world test scripts (not a test by itself): temp file
 * databases, a pre-migration database, minting owned Pokémon, and onboarding a
 * test user. Temp databases are real files (the libSQL local client opens a new
 * connection per transaction, so `:memory:` would not share state).
 */
import { createClient } from '@libsql/client';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applySchema, insertOwned, insertProfileWithStarter, type Db } from '../api/_db.js';
import type { CatchOrigin, MintSpec, OwnedMon } from '../src/game/box.js';

const SCHEMA = join(dirname(fileURLToPath(import.meta.url)), '..', 'db', 'schema.sql');

export interface TempDb {
  db: Db;
  url: string;
  cleanup(): void;
}

function open(name: string): TempDb {
  const dir = mkdtempSync(join(tmpdir(), `world-${name}-`));
  const url = `file:${join(dir, 'test.db')}`;
  const db = createClient({ url });
  return {
    db,
    url,
    cleanup() {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/**
 * WAL, because the libSQL local client leaves a finished SELECT's statement
 * open: in the default rollback-journal mode that idle read lock on one
 * connection blocks every other connection's COMMIT, and transactions run on
 * their own connections. Remote Turso databases are unaffected.
 */
async function openWal(name: string): Promise<TempDb> {
  const t = open(name);
  await t.db.execute('pragma journal_mode = wal');
  return t;
}

/** A fresh database with the full schema and every column add applied. */
export async function tempDb(name: string): Promise<TempDb> {
  const t = await openWal(name);
  await applySchema(t.db);
  return t;
}

/** A database as it looks before `db:setup` runs this change: schema.sql only, no column adds. */
export async function legacyDb(name: string): Promise<TempDb> {
  const t = await openWal(name);
  await t.db.executeMultiple(readFileSync(SCHEMA, 'utf8'));
  return t;
}

export async function mintMon(
  db: Db,
  uid: string,
  spec: Partial<MintSpec> & { dexId: number; level: number },
  origin: CatchOrigin = 'catch',
  now = 1,
): Promise<OwnedMon> {
  return insertOwned(db, uid, { sign: 'aries', shiny: false, altColor: false, ...spec }, origin, now);
}

/** Onboard `uid` with a starter (Caterpie Lv 5 by default); returns the starter row. */
export async function onboardUser(db: Db, uid: string, dexId = 10, level = 5): Promise<OwnedMon> {
  return insertProfileWithStarter(
    db,
    { userId: uid, profession: 'trainer', mentor: 'oak', currentRoute: 'r1', createdAt: 1 },
    { dexId, level, sign: 'aries', shiny: false, altColor: false },
    1,
  );
}

let passed = 0;
let failed = 0;

export function check(label: string, ok: boolean): void {
  if (ok) passed++;
  else {
    failed++;
    console.error(`FAIL: ${label}`);
  }
}

export function finish(): never {
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
