-- Schema for the optional accounts + progression layer (Turso / libSQL, SQLite).
--
-- Entirely additive: the public daily boards stay in Upstash Redis and are
-- untouched. Nothing here is read or written unless a request carries a valid
-- session cookie, so anonymous play is unaffected.
--
-- Apply with:  npm run db:setup     (uses TURSO_DATABASE_URL/_AUTH_TOKEN from .env.local)
-- Idempotent — every statement is `create ... if not exists`.

-- One account. Secrets (password_hash) never leave the server. email/password
-- and OAuth (discord/google) all resolve to a row here; linking is by verified
-- email. `email_verified` is 0/1; timestamps are epoch milliseconds; ids are
-- app-generated UUID strings.
create table if not exists users (
  id             text primary key,
  email          text not null,
  email_lower    text not null unique,          -- uniqueness + linking key
  display_name   text not null default '',
  email_verified integer not null default 0,
  password_hash  text,                          -- null for OAuth-only accounts
  discord_id     text unique,
  google_sub     text unique,
  created_at     integer not null default 0,
  runs           integer not null default 0,
  wins           integer not null default 0,
  losses         integer not null default 0
);

-- One row per caught (species, variant). `layer` is 'n' / 'a' / 's'. The
-- composite PK makes crediting idempotent: INSERT OR IGNORE simply "ORs in" a
-- cell, and the count of rows actually inserted is the run's formsGained.
create table if not exists pokedex_cells (
  user_id   text not null,
  dex_id    integer not null,
  layer     text not null,
  caught_at integer not null default 0,
  primary key (user_id, dex_id, layer)
);

-- Personal run history (the source for "My Runs" and the personal hall of
-- fame/shame, which are just outcome filters). run_id = `${date}:${seed}` so a
-- re-flush of the same run is a no-op. `team` is JSON text.
create table if not exists runs (
  user_id        text not null,
  run_id         text not null,
  date           text not null,
  bracket        text not null,
  difficulty     text not null,
  outcome        text not null,                 -- 'win' | 'loss' | 'ragequit'
  cleared_stages integer not null default 0,
  team           text not null default '[]',
  fell_to        text,
  forms_gained   integer not null default 0,
  at             integer not null default 0,
  primary key (user_id, run_id)
);
create index if not exists runs_user_at_idx on runs (user_id, at desc);

-- Single-use, expiring tokens for email verification, password reset and the
-- OAuth round-trip (CSRF state). Consume = DELETE ... WHERE expires_at > ?
-- RETURNING, which checks validity and burns the token atomically. `data` is
-- JSON text (e.g. {"provider":"discord"} for OAuth state) or null.
create table if not exists auth_tokens (
  token      text primary key,
  kind       text not null,                     -- 'verify' | 'reset' | 'oauth'
  user_id    text,
  data       text,
  expires_at integer not null
);
create index if not exists auth_tokens_expiry_idx on auth_tokens (expires_at);
