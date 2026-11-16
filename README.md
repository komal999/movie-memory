# Movie Memory

Sign in with Google, save your favorite movie, get a fun fact about it from OpenAI.

**Variant chosen: A (backend: caching and correctness).** See [Why Variant A](#why-variant-a).

Stack: Next.js 16 (App Router) · TypeScript · React 19 · Tailwind v4 · Postgres · Prisma 7 · Auth.js v5 (Google) · OpenAI · Vitest

---

## Setup

Requires Node 20.9+ (tested on 22). Postgres comes from Docker, or bring your own 14+.

```bash
docker compose up -d        # Postgres 16 on :5432 (+ a movie_memory_test DB for tests)
npm install                 # also runs `prisma generate`
cp .env.example .env        # fill in the values below
npx prisma migrate deploy   # or `npm run db:migrate` during development
npm run dev                 # http://localhost:3000
```

### Environment variables

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string |
| `AUTH_SECRET` | yes | `npx auth secret` |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | yes | Google Cloud OAuth client. Redirect URI: `http://localhost:3000/api/auth/callback/google` |
| `OPENAI_API_KEY` | yes | Server-only. Never `NEXT_PUBLIC_` |
| `OPENAI_MODEL` | no | Defaults to `gpt-4.1-mini` |
| `AUTH_TRUST_HOST` | for `next start` | `next dev` trusts localhost automatically; production builds need this or `AUTH_URL` |

### Database migrations

The schema is in `prisma/schema.prisma`. The migration is in `prisma/migrations/`.

- Apply: `npx prisma migrate deploy`
- After changing the schema: `npx prisma migrate dev --name <change>`

### Tests

```bash
npm test          # unit + API route tests (no DB needed)

# + Postgres integration tests (advisory lock, ownership), using the compose test DB:
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/movie_memory_test npx prisma migrate deploy
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/movie_memory_test npm test
```

The integration tests need a separate, migrated database (never the dev one — they delete all rows between tests).

CI (`.github/workflows/ci.yml`) runs lint, typecheck, the full suite against a real Postgres 16 service, and a production build on every push.

---

## Architecture overview

```
app/
  page.tsx                  Landing: "Sign in with Google" (redirects if already signed in)
  onboarding/               First-time favorite-movie form (Server Action + useActionState)
  dashboard/                Profile, favorite movie, logout, <FactCard/> (client)
  api/fact/route.ts         GET → fact for the *current* user (Variant A logic)
  api/facts/[id]/route.ts   GET → one stored fact, only if you own it
  api/auth/[...nextauth]/   Auth.js handlers
auth.ts                     Auth.js config: Google + Prisma adapter, database sessions
lib/
  session.ts                Data access layer: getCurrentUser() / requireUser()
  validation.ts             zod schema for movie titles (shared server rule)
  facts.ts                  ★ Fact service: cache window, lock re-check, fallback (pure, injectable)
  fact-store.ts             Postgres implementation of FactStore (advisory lock)
  fact-service.ts           Production wiring: Prisma store + OpenAI generator
  openai.ts                 OpenAI call with timeout, prompt-injection-aware prompt
  api-response.ts           Uniform JSON `{ error: { code, message } }` responses
prisma/                     Schema + migrations
tests/                      Vitest: unit, API route, Postgres integration
```

### Auth flow

- **Database sessions** (Auth.js Prisma adapter). The cookie is an opaque token looked up in `Session`, so logout or deleting the row revokes access immediately. The session callback exposes `user.id`.
- **Routing**: there is no middleware/proxy. Each page checks auth on the server before it renders:
  - `/`: if signed in, redirect to `/dashboard` (has movie) or `/onboarding` (no movie).
  - `/onboarding`: signed out → `/`; already has a movie → `/dashboard`.
  - `/dashboard`: signed out → `/`; no movie yet → `/onboarding`.
- "First-time user" is defined by a single fact: `User.favoriteMovie IS NULL`. Login always lands on `/dashboard`, which forwards new users. There's no separate `isNew` flag to keep in sync.
- Next 16 docs explicitly say Proxy (formerly middleware) should not be the authorization layer. Page-level checks plus a re-check in every Server Action and Route Handler is the documented pattern.

### Schema design

```
User  (id, name?, email?, image?, favoriteMovie? VARCHAR(120), …Auth.js fields)
Fact  (id, userId → User, movieTitle VARCHAR(120), content, createdAt)
      INDEX (userId, movieTitle, createdAt DESC)
Account / Session / VerificationToken   (standard Auth.js adapter tables)
```

- **`favoriteMovie` lives on `User`.** The spec has exactly one favorite movie per user. A separate `Movie` table would add a join and no benefit. If we later wanted history or multiple favorites, it would become its own table.
- **`Fact` is append-only and snapshots `movieTitle`.** The cache key is `(userId, movieTitle)`. If the favorite movie changes, a fact about the old movie can never be served as a cache hit for the new one, and old facts stay accurate history.
- **There is no cache table or TTL column.** "Cached fact" just means the newest `Fact` row, served by one composite index scan (`LIMIT 1`).
- **`VARCHAR(120)` mirrors the zod max**, so the DB enforces the same limit as the validator.
- `onDelete: Cascade` everywhere: deleting a user removes their facts and sessions.

### Fact generation (Variant A)

`lib/facts.ts → getFactForUser(userId, { store, generate, now })`

1. Load the user's favorite movie (no movie → `409 NO_MOVIE`).
2. **Fast path, no lock:** if the newest fact for `(user, movie)` is less than 60s old, return it (`source: "cache"`).
3. Otherwise **take the per-user lock** and **re-check**. A request that waited behind another generation finds the fresh fact here and returns it.
4. Still stale: call OpenAI, insert the fact, return it (`source: "generated"`).
5. OpenAI fails (timeout, 5xx, empty): return the newest stale fact if one exists (`source: "fallback"`), else `503 GENERATION_FAILED` with a friendly message. Details are logged server-side, never sent to the client.

**The 60-second window.** `now - createdAt < 60_000ms`. 59.999s is a cache hit; exactly 60s regenerates. `createdAt` is written from the same app clock used for comparison, so DB and app clock skew or timezone can't shift the window.

**Burst / idempotency protection: Postgres advisory lock.**

```sql
SELECT pg_advisory_xact_lock(hashtext('fact:' || userId))   -- inside a transaction
```

- Requests for the same user queue on the lock, so 10 refreshes or tabs produce **one** OpenAI call and **one** row. Verified by an integration test. With the lock removed, the same test fails with 8 calls.
- The lock is transaction-scoped, so it's released on commit, rollback or crash. It can't get stuck, needs no cleanup job, and works across multiple server instances (unlike an in-memory lock).
- A `hashtext` collision only means two users occasionally wait on each other. It never returns the wrong data, because every query still filters by `userId`.
- Different users never block each other.

**Safe OpenAI integration**
- The API key is read only in `lib/openai.ts`, which is marked `server-only`, so importing it from a client component is a build error.
- A 10s timeout and `maxRetries: 0`, because a failure falls back to the cached fact rather than making the user wait through retries while holding the lock.
- The movie title goes in its own user message, and the system prompt tells the model to treat it as data, not instructions. The output is length-capped.

### Security and authorization

- **The user id comes only from the server session.** No route or action accepts a user id from the client.
- Every fact query filters by `userId`. `GET /api/facts/:id` uses `WHERE id = ? AND userId = ?`, and someone else's fact returns **404** (not 403), so ids can't be probed.
- Server Actions re-check the session (they're public endpoints, regardless of which page renders them).
- Movie input is validated server-side: trim, collapse whitespace, 1–120 chars, no control characters. The client `maxLength` is only a convenience.
- The onboarding write is `updateMany({ where: { id, favoriteMovie: null } })`, so it really is first-time-only, even with two tabs open or a replayed request.
- Missing Google name falls back to "Movie fan" / no greeting name. Missing photo falls back to an initials avatar.

### Testing

| File | What it covers |
|---|---|
| `tests/facts.test.ts` | Cache boundary (59.999s vs 60s), regenerate after expiry, cache miss on movie change, burst → 1 generation, per-user isolation, fallback to stale fact, friendly error without leaking internals, **authorization** (can't read another user's fact, never served another user's cache even for the same movie) |
| `tests/api-routes.test.ts` | 401 when signed out (service never called), session id is used, 503 error shape, 404 for another user's fact |
| `tests/fact-store.integration.test.ts` | **Real Postgres**: advisory lock under 8 concurrent requests, ownership filter, per-user cache |
| `tests/validation.test.ts` | Trim, length bounds, control characters, non-strings |

The fact service depends on a small `FactStore` interface. The logic runs against an in-memory store with a real per-user mutex in unit tests (fast, deterministic clock) and against Postgres in integration tests.

---

## Why Variant A

My background is backend and data infrastructure: Postgres schema design, ingestion pipelines, LLM integration. Variant A's core problems are the interesting ones there: picking the cache key, making a time window correct, reasoning about concurrent writers, and degrading gracefully when a third-party API fails. They also have crisp, testable correctness properties ("N concurrent requests → exactly 1 OpenAI call"), which I can prove with tests rather than just assert.

## Key tradeoffs

- **The lock is held during the OpenAI call.** This is the simplest correct design: waiters block briefly, then get the fresh fact. The cost is that a generating request holds one DB connection (and its transaction) for up to ~10s. That's fine at this scale. At high traffic I'd switch to a short-lived "generation lease" row (`INSERT … ON CONFLICT DO NOTHING`), release the connection during the OpenAI call, and let losers return the latest fact or poll.
- **Waiting vs. returning immediately.** Queued requests wait (`pg_advisory_xact_lock`) rather than fail fast (`pg_try_advisory_xact_lock`). The user gets a real fact instead of a "try again" message.
- **The fallback serves stale data** (labelled in the UI) rather than an error. A fun fact being a few minutes old is harmless.
- **The cache window is per (user, movie), not global per movie.** Two users with the same favorite get separate facts. This follows the spec ("this user + movie") and keeps data ownership simple. A shared per-movie cache would cut OpenAI cost.
- **Database sessions vs. JWT.** One extra DB read per request in exchange for instant revocation and no session data in cookies.
- **`cacheComponents` is off.** Every page is per-user and dynamic, so there's no static shell to win, and auth redirects happen on the server before any HTML streams.
- **The fact loads client-side** (`/api/fact` from `<FactCard/>`), so a slow OpenAI call never blocks the dashboard render, and the page gets proper loading, error and fallback states.

## With 2 more hours

- Replace the lock-during-API-call with a generation lease plus a stale-while-revalidate response, so no connection is held during OpenAI calls.
- Rate-limit `/api/fact` per user (the cache bounds OpenAI cost, but not request volume).
- Show "fact history" and let users edit their favorite movie (the schema already supports both).
- An end-to-end Playwright test of the OAuth redirect flow using a stubbed provider.
- Structured logging and metrics: cache hit rate, generation latency, fallback rate.
- A Docker Compose file for Postgres plus CI running the integration tests.

---

## AI usage

- Used an AI assistant (Claude) to scaffold boilerplate (Auth.js and Prisma setup, Tailwind markup) and to draft parts of this README.
- Design decisions are mine and I can walk through each one: the schema, the cache key, the advisory-lock approach, the fallback semantics and the test strategy.
- Used AI to check Next.js 16 and Prisma 7 changes (middleware renamed to `proxy`, `prisma.config.ts`, driver adapters), then verified against the docs bundled in `node_modules`.
- All code was reviewed, type-checked, linted and tested. The lock test was mutation-checked: removing the lock makes it fail.
