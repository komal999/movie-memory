import type { PrismaClient, Prisma } from "@/generated/prisma/client";
import type { FactStore, StoredFact } from "@/lib/facts";

type Db = PrismaClient | Prisma.TransactionClient;

// The lock holder keeps a DB transaction open for the duration of the OpenAI call,
// so the transaction timeout must comfortably exceed the OpenAI timeout.
const LOCK_TX_TIMEOUT_MS = 15_000;
const LOCK_TX_MAX_WAIT_MS = 5_000;

const factSelect = {
  id: true,
  userId: true,
  movieTitle: true,
  content: true,
  createdAt: true,
} as const;

/**
 * Postgres-backed FactStore.
 *
 * Burst protection uses a transaction-scoped advisory lock keyed on the user id:
 *   SELECT pg_advisory_xact_lock(hashtext('fact:' || userId))
 * It is released automatically on commit/rollback (including crashes), works
 * across multiple app instances, and needs no extra table or cleanup job.
 */
export function createPrismaFactStore(db: PrismaClient, tx: Db = db): FactStore {
  return {
    async getFavoriteMovie(userId) {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { favoriteMovie: true } });
      return user?.favoriteMovie ?? null;
    },

    findLatest(userId, movieTitle): Promise<StoredFact | null> {
      return tx.fact.findFirst({
        where: { userId, movieTitle },
        orderBy: { createdAt: "desc" },
        select: factSelect,
      });
    },

    create(data) {
      return tx.fact.create({ data, select: factSelect });
    },

    findByIdForUser(factId, userId) {
      // Filtering on BOTH id and userId is the authorization check.
      return tx.fact.findFirst({ where: { id: factId, userId }, select: factSelect });
    },

    withUserLock(userId, fn) {
      return db.$transaction(
        async (lockedTx) => {
          await lockedTx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`fact:${userId}`}))`;
          return fn(createPrismaFactStore(db, lockedTx));
        },
        { timeout: LOCK_TX_TIMEOUT_MS, maxWait: LOCK_TX_MAX_WAIT_MS },
      );
    },
  };
}
