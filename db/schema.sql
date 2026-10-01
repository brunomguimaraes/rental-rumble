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

-- One row per PERMANENTLY-OWNED Pokémon (the "box"). Unlike pokedex_cells (a
-- species/variant completion overlay), each catch mints its own unique
-- individual here, with its own level/exp and rolled identity. The server is the
-- sole writer (via api/catch/*): the client can neither invent a row nor edit a
-- level. `sign`/`ability`/`build`/`shiny`/`alt_color`/`emotion` round-trip the
-- same rolled identity the draft uses, so an owned mon rebuilds into an
-- identical battle Creature. `origin` distinguishes the one-time tutorial gift
-- from ordinary catches. Timestamps are epoch ms.
--
-- Tutorial state is derived, not stored: a profile with no origin='tutorial'
-- row still owes the guided first catch, whatever else the box holds (accounts
-- from before onboarding may own earlier catches).
--
-- `stats` (added through COLUMN_ADDS in api/_db.ts, like `nickname`) is JSON
-- text: the six current stats on the growth model's scale (src/game/growth.ts).
-- Null on rows minted before the growth system; api/_db.ts backfills those on
-- read as an average individual of the species at that level.
create table if not exists owned_pokemon (
  id         text primary key,
  user_id    text not null,
  dex_id     integer not null,
  level      integer not null default 1,
  exp        integer not null default 0,
  sign       text not null default '',
  ability    text,
  build      text,
  shiny      integer not null default 0,
  alt_color  integer not null default 0,
  emotion    text,
  origin     text not null default 'catch',     -- 'tutorial' | 'catch'
  caught_at  integer not null default 0
);
create index if not exists owned_user_idx on owned_pokemon (user_id, caught_at desc);

-- The role-play identity: one row per onboarded user. Written once by
-- api/me/onboard. `mentor` is the professor id; `starter_id` the owned row.
-- `party` (added by COLUMN_ADDS in api/_db.ts) is the saved party: a JSON array
-- of owned ids, lead first; null until the player saves one (the starter leads).
-- `current_route` is left over from the paused idle routes and unused.
create table if not exists profiles (
  user_id       text primary key,
  profession    text not null,
  mentor        text not null,
  starter_id    text not null,
  current_route text not null default 'r1',
  created_at    integer not null default 0
);

-- One row per activity on the world map: training ('train') and expeditions
-- ('explore'). `claimed_at` is null while it is open (it means "settled at");
-- idle_one_open_idx allows one open activity per user across both modes.
-- COLUMN_ADDS in api/_db.ts adds: `mode`, `rules_version`, `party_snapshot`
-- (the ordered party frozen at start), `config` (the route rules frozen at
-- start), `state` (expedition position and trail), `step` (checkpoint counter
-- every step write is conditional on), `request_id` (idempotent start),
-- `result` (settlement JSON) and `seen_at` (result dismissed). `seed` never
-- leaves the server. Rows from the paused idle routes have no mode or rules
-- version; an open one is finished as training on its route. `log` belongs to
-- those old rows only.
create table if not exists idle_sessions (
  id          text primary key,
  user_id     text not null,
  route_id    text not null,
  party_ids   text not null,
  seed        text not null,
  started_at  integer not null,
  claimed_at  integer,
  stopped_by  text,
  encounters  integer not null default 0,
  log         text
);
create index if not exists idle_user_open_idx on idle_sessions (user_id, claimed_at);
create unique index if not exists idle_one_open_idx on idle_sessions (user_id) where claimed_at is null;

-- The wilds an activity battled, written when it settles. A future capture
-- slice may let the player throw balls at them (`resolved` flips to 1); for now
-- they are only a log.
create table if not exists encounters (
  session_id  text not null,
  slot        integer not null,
  dex_id      integer not null,
  level       integer not null,
  won         integer not null default 0,
  resolved    integer not null default 0,
  primary key (session_id, slot)
);

-- Per trainer and route on the world map: when its guardian first fell
-- (`cleared_at`, the milestone that unlocks neighbouring routes) and counters.
-- Unlocks are derived from cleared_at, never stored.
create table if not exists world_progress (
  user_id       text not null,
  location_id   text not null,
  cleared_at    integer,
  explores      integer not null default 0,
  clears        integer not null default 0,
  trainings     integer not null default 0,
  training_wins integer not null default 0,
  primary key (user_id, location_id)
);

-- What a trainer has found per route: species seen (`kind` 'seen', `ref` the
-- dex id) and landmarks (`kind` 'landmark', `ref` the landmark id). Seeing is
-- not owning: nothing here touches pokedex_cells.
create table if not exists world_discoveries (
  user_id     text not null,
  location_id text not null,
  kind        text not null,
  ref         text not null,
  found_at    integer not null default 0,
  primary key (user_id, location_id, kind, ref)
);

-- Active Route 1 gameplay. Historical idle data remains untouched.
create table if not exists route_accounts (
  user_id text primary key,
  activated_at integer not null,
  actions integer not null check (actions >= 0 and actions <= 48),
  refilled_at integer not null,
  inventory_revision integer not null default 0,
  revision integer not null default 0,
  transition text
);

create table if not exists inventory_items (
  user_id text not null,
  item_id text not null,
  quantity integer not null check (quantity >= 0 and quantity <= 9007199254740991),
  primary key (user_id, item_id)
);

create table if not exists route_events (
  id text primary key,
  user_id text not null,
  created_at integer not null,
  revision integer not null,
  active integer not null check (active in (0, 1)),
  seen_at integer,
  data text not null
);
create unique index if not exists route_one_active_idx on route_events (user_id) where active = 1;
create index if not exists route_events_user_time_idx on route_events (user_id, created_at desc);

create table if not exists route_receipts (
  user_id text not null,
  request_id text not null,
  payload text not null,
  receipt text not null,
  created_at integer not null,
  primary key (user_id, request_id)
);

create table if not exists route_quests (
  user_id text not null,
  quest_id text not null,
  accepted_at integer not null,
  claimed_at integer,
  primary key (user_id, quest_id)
);
