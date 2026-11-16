/**
 * Fact service — Variant A (60s cache, burst protection, failure fallback).
 *
 * This module is deliberately framework-free: storage, the LLM call and the clock
 * are injected, so the cache-window and concurrency logic can be unit tested
 * without Next.js, Postgres or OpenAI.
 */

export const CACHE_WINDOW_MS = 60_000;

export type StoredFact = {
  id: string;
  userId: string;
  movieTitle: string;
  content: string;
  createdAt: Date;
};

/** What we send to the client. No userId: the caller already knows who they are. */
export type PublicFact = {
  id: string;
  movieTitle: string;
  content: string;
  createdAt: string; // ISO-8601
};

export interface FactStore {
  getFavoriteMovie(userId: string): Promise<string | null>;
  findLatest(userId: string, movieTitle: string): Promise<StoredFact | null>;
  create(data: Omit<StoredFact, "id">): Promise<StoredFact>;
  /** Ownership-scoped lookup: returns null for facts that belong to someone else. */
  findByIdForUser(factId: string, userId: string): Promise<StoredFact | null>;
  /**
   * Run `fn` while holding an exclusive per-user lock. Concurrent callers for the
   * same user queue up; different users never block each other (barring hash collisions).
   */
  withUserLock<T>(userId: string, fn: (store: FactStore) => Promise<T>): Promise<T>;
}

export type FactGenerator = (movieTitle: string) => Promise<string>;

export type FactDeps = {
  store: FactStore;
  generate: FactGenerator;
  now?: () => Date;
  logError?: (message: string, err: unknown) => void;
};

export type FactSource = "cache" | "generated" | "fallback";

export type FactResult =
  | { ok: true; source: FactSource; fact: PublicFact }
  | { ok: false; code: "NO_MOVIE" | "GENERATION_FAILED"; message: string };

export function isWithinCacheWindow(createdAt: Date, now: Date, windowMs = CACHE_WINDOW_MS): boolean {
  return now.getTime() - createdAt.getTime() < windowMs;
}

export function toPublicFact(f: StoredFact): PublicFact {
  return {
    id: f.id,
    movieTitle: f.movieTitle,
    content: f.content,
    createdAt: f.createdAt.toISOString(),
  };
}

/**
 * Returns a fact for the user's current favorite movie.
 *
 *  1. Fast path (no lock): newest fact < 60s old → return it.
 *  2. Otherwise take the per-user lock and re-check. Requests that were queued
 *     behind a generation will find the fresh fact here and return it, so a burst
 *     of N requests produces exactly one OpenAI call.
 *  3. Still stale → generate, store, return.
 *  4. Generation failed → return the newest (stale) fact if any, else an error.
 */
export async function getFactForUser(userId: string, deps: FactDeps): Promise<FactResult> {
  const { store, generate } = deps;
  const now = deps.now ?? (() => new Date());
  const logError = deps.logError ?? ((msg, err) => console.error(msg, err));

  const movieTitle = await store.getFavoriteMovie(userId);
  if (!movieTitle) {
    return { ok: false, code: "NO_MOVIE", message: "Add a favorite movie to get a fact." };
  }

  const latest = await store.findLatest(userId, movieTitle);
  if (latest && isWithinCacheWindow(latest.createdAt, now())) {
    return { ok: true, source: "cache", fact: toPublicFact(latest) };
  }

  return store.withUserLock(userId, async (locked) => {
    // Re-read under the lock: someone may have generated while we were waiting.
    const current = await locked.findLatest(userId, movieTitle);
    if (current && isWithinCacheWindow(current.createdAt, now())) {
      return { ok: true, source: "cache", fact: toPublicFact(current) };
    }

    try {
      const content = await generate(movieTitle);
      const created = await locked.create({ userId, movieTitle, content, createdAt: now() });
      return { ok: true, source: "generated", fact: toPublicFact(created) };
    } catch (err) {
      logError("[facts] generation failed", err);
      if (current) {
        return { ok: true, source: "fallback", fact: toPublicFact(current) };
      }
      return {
        ok: false,
        code: "GENERATION_FAILED",
        message: "We couldn't come up with a fact right now. Please try again in a moment.",
      };
    }
  });
}

/** Authorization-scoped read of a single fact. null = not found OR not yours (indistinguishable on purpose). */
export async function getFactByIdForUser(
  factId: string,
  userId: string,
  store: FactStore,
): Promise<PublicFact | null> {
  const fact = await store.findByIdForUser(factId, userId);
  return fact ? toPublicFact(fact) : null;
}
