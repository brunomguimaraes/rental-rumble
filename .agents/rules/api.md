# API

Vercel serverless functions. Each area is one dynamic dispatcher, `api/<area>/[action].ts`, that switches on
`req.query.action`; shared infrastructure lives in `api/_*.ts` (the `_` prefix keeps Vercel from routing it).

## Handlers

**Dispatcher → action function → `api/_*.ts` helpers → Turso/Redis**

- Keep actions thin: check method, gate, rate-limit, validate input, call helpers, respond. SQL lives in
  `api/_db.ts`; multi-step domain writes (like a claim) live in their own module (`api/_idle.ts`).
- Prefer a new action in an existing dispatcher over a new top-level function. A new dispatcher area must be
  added to the hardcoded list in `scripts/dev-api.ts` (`resolveRoute`), or it 404s under `npm run dev:local`.
- Game rules come from `src/game/` so client and server agree. Never fork a rule into `api/`.
- Read env vars in the `api/_*.ts` infra modules, lazily, so a missing value degrades instead of crashing at import.
  `api/auth/[action].ts` reads a few OAuth values directly; don't spread that further.

## Order inside an action

1. `requirePost` for anything that writes (405 with an `Allow` header).
2. `gate`: `Cache-Control: no-store`, `readSession` (401), `getDb()` (`ok: false` when unavailable).
3. `rateLimit` per user for writes, keyed `rl:<area>:<window>:<uid>`.
4. Validate the body as `unknown`: check every field's type, dedupe ids, bound lengths, and confirm ownership
   against the database. Trust nothing the client sends except the ids it names.
5. Do the work; respond.

## Responses

- Always JSON `{ ok: true, ... }` or `{ ok: false, error }`. `error` is a short player-facing sentence.
- Never put internal detail (SQL, stack, env names) in `error`. Log it instead.

| Code | When |
|---|---|
| 200 | Success, or `ok: false` when the account layer is unavailable |
| 400 | Invalid or missing input; a rule the request breaks (locked route, ineligible party) |
| 401 | No valid session |
| 404 | Unknown action or resource |
| 405 | Wrong method |
| 409 | Conflict: already claimed, trainer already out, unique-constraint race |
| 429 | Rate limited |
| 503 | Database or upstream failure |

## Errors and logging

- Wrap each action's database work in one `try/catch` that logs `console.error('[<area>/<action>] failed:', err)`
  and returns 503. Map known failures (unique constraint → 409) before rethrowing or falling through.
- Once a write has committed, a failed follow-up read must not turn the response into an error; return the
  committed result without the extra data.
- Never log passwords, tokens, session cookies, or full emails.

## Security

- Every query is scoped by the session's user id; a request can only read or change its own rows.
- Auth tokens are single-use and expiring; consume them atomically (`delete ... returning`).
- Idempotency and races are enforced in the database (unique indexes, conditional updates), not by a read-then-write.
