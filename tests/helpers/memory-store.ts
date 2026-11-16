import type { FactStore, StoredFact } from "@/lib/facts";

/** In-memory FactStore with a real per-user mutex, for fast unit tests. */
export function createMemoryStore(users: Record<string, string | null>) {
  const facts: StoredFact[] = [];
  const locks = new Map<string, Promise<unknown>>();
  const holders = new Map<string, number>(); // queued + running, per user
  let seq = 0;

  const store: FactStore = {
    async getFavoriteMovie(userId) {
      return users[userId] ?? null;
    },
    async findLatest(userId, movieTitle) {
      const mine = facts.filter((f) => f.userId === userId && f.movieTitle === movieTitle);
      return mine.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;
    },
    async create(data) {
      const fact = { id: `fact_${++seq}`, ...data };
      facts.push(fact);
      return fact;
    },
    async findByIdForUser(factId, userId) {
      return facts.find((f) => f.id === factId && f.userId === userId) ?? null;
    },
    withUserLock(userId, fn) {
      const waited = (holders.get(userId) ?? 0) > 0;
      holders.set(userId, (holders.get(userId) ?? 0) + 1);
      const prev = locks.get(userId) ?? Promise.resolve();
      const run = prev
        .then(() => fn(store, { waited }))
        .finally(() => holders.set(userId, holders.get(userId)! - 1));
      locks.set(userId, run.catch(() => undefined));
      return run;
    },
  };

  return { store, facts, users };
}
