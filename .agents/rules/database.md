# Database

Turso (libSQL/SQLite) through `@libsql/client`. Schema in `db/schema.sql`; client, row mappers, and queries in
`api/_db.ts`. Local dev and tests point the same client at a `file:` database.

## Client and queries

- Get the client from `getDb()`; it returns `null` when unconfigured, and callers handle that.
- Functions that may run inside a transaction take an `Executor`, not a `Db`.
- Parameterize every value with `args` and `?`. Never interpolate input into SQL; the only interpolation allowed
  is a generated `?, ?, ?` placeholder list.
- Map rows once, in a `rowToX` function (snake_case columns → camelCase fields, `0/1` → boolean,
  `Number(...) || 0` for defaults). Handlers never touch raw rows.
- Scope reads and writes by `user_id`. `readOwnedByIds` shows the pattern: return only rows the user owns and
  let the caller compare lengths.
- Multi-statement writes that must land together use a transaction or `batch`.
- Avoid N+1 loops of `execute`; load a user's rows in one query and index them in a `Map`.

## Schema conventions

- Ids are app-generated UUID strings (`newId()`); timestamps are epoch milliseconds in `integer` columns;
  booleans are `integer` 0/1; structured data is JSON `text`.
- Table and column names are snake_case.
- Add an index for every column set a hot query filters or sorts on, and a unique index for every invariant
  (one open idle session per user, one Pokédex cell per species/layer).

## Changing the schema

- `db/schema.sql` must stay idempotent: `create table if not exists`, `create index if not exists`.
- A new column on an existing table goes in `COLUMN_ADDS` in `api/_db.ts`, which ignores `duplicate column`.
- Changes are additive and backward compatible (expand, then contract): the deployed code must keep working
  against the new schema, and the new code against a database that has not run `db:setup` yet.
- A new unique index can fail on existing duplicates. Add a pre-check query to `RELEASING.md`'s checklist.
- Never run `db:setup` or ad hoc SQL against production without the owner's confirmation.
