/**
 * Integration tests against a real Postgres (advisory lock + ownership filter).
 * Runs only when TEST_DATABASE_URL is set, e.g.:
 *   TEST_DATABASE_URL=postgresql://postgres@localhost:5432/movie_memory_test npm test
 * The database must already have migrations applied (npx prisma migrate deploy).
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { createPrismaFactStore } from "@/lib/fact-store";
import { getFactByIdForUser, getFactForUser } from "@/lib/facts";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("Postgres FactStore", () => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
  const store = createPrismaFactStore(prisma);

  beforeEach(async () => {
    await prisma.fact.deleteMany();
    await prisma.user.deleteMany();
    await prisma.user.createMany({
      data: [
        { id: "alice", email: "alice@example.com", favoriteMovie: "Alien" },
        { id: "bob", email: "bob@example.com", favoriteMovie: "Alien" },
      ],
    });
  });

  afterAll(() => prisma.$disconnect());

  it("advisory lock: 8 concurrent requests → one OpenAI call, one row", async () => {
    const generate = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 100));
      return "Alien's chestburster scene surprised the cast.";
    });

    const results = await Promise.all(
      Array.from({ length: 8 }, () => getFactForUser("alice", { store, generate, logError: () => {} })),
    );

    expect(generate).toHaveBeenCalledTimes(1);
    expect(await prisma.fact.count({ where: { userId: "alice" } })).toBe(1);
    expect(results.every((r) => r.ok)).toBe(true);
  });

  it("ownership: bob cannot read alice's fact by id", async () => {
    const r = await getFactForUser("alice", { store, generate: async () => "fact", logError: () => {} });
    const id = r.ok ? r.fact.id : "";

    expect(await getFactByIdForUser(id, "alice", store)).not.toBeNull();
    expect(await getFactByIdForUser(id, "bob", store)).toBeNull();
  });

  it("cache window is per user even for the same movie", async () => {
    const generate = vi.fn(async () => "fact");
    await getFactForUser("alice", { store, generate, logError: () => {} });
    const bob = await getFactForUser("bob", { store, generate, logError: () => {} });

    expect(bob).toMatchObject({ ok: true, source: "generated" });
    expect(generate).toHaveBeenCalledTimes(2);
  });
});
