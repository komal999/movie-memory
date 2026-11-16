import { describe, expect, it, vi } from "vitest";
import { CACHE_WINDOW_MS, getFactByIdForUser, getFactForUser, isWithinCacheWindow } from "@/lib/facts";
import { createMemoryStore } from "./helpers/memory-store";

const T0 = new Date("2026-01-01T00:00:00.000Z");
const at = (ms: number) => new Date(T0.getTime() + ms);

function setup(users: Record<string, string | null> = { alice: "Alien", bob: "Heat" }) {
  const mem = createMemoryStore(users);
  let clock = T0;
  let n = 0;
  const generate = vi.fn(async (movie: string) => `fact #${++n} about ${movie}`);
  const deps = {
    store: mem.store,
    generate,
    now: () => clock,
    logError: () => {},
  };
  return { ...mem, generate, deps, setClock: (d: Date) => (clock = d) };
}

describe("isWithinCacheWindow", () => {
  it("is fresh just under 60s and stale at exactly 60s", () => {
    expect(isWithinCacheWindow(T0, at(CACHE_WINDOW_MS - 1))).toBe(true);
    expect(isWithinCacheWindow(T0, at(CACHE_WINDOW_MS))).toBe(false);
  });
});

describe("getFactForUser — 60-second cache", () => {
  it("generates when there is no fact yet", async () => {
    const t = setup();
    const r = await getFactForUser("alice", t.deps);
    expect(r).toMatchObject({ ok: true, source: "generated" });
    expect(t.generate).toHaveBeenCalledTimes(1);
  });

  it("returns the cached fact within 60s without calling OpenAI", async () => {
    const t = setup();
    const first = await getFactForUser("alice", t.deps);
    t.setClock(at(59_999));
    const second = await getFactForUser("alice", t.deps);

    expect(second).toMatchObject({ ok: true, source: "cache" });
    expect(second.ok && first.ok && second.fact.id).toBe(first.ok && first.fact.id);
    expect(t.generate).toHaveBeenCalledTimes(1);
  });

  it("generates and stores a new fact once the cached one is 60s old", async () => {
    const t = setup();
    await getFactForUser("alice", t.deps);
    t.setClock(at(60_000));
    const r = await getFactForUser("alice", t.deps);

    expect(r).toMatchObject({ ok: true, source: "generated", fact: { content: "fact #2 about Alien" } });
    expect(t.generate).toHaveBeenCalledTimes(2);
    expect(t.facts).toHaveLength(2);
  });

  it("does not serve a cached fact for a different movie", async () => {
    const t = setup();
    await getFactForUser("alice", t.deps);
    t.users.alice = "Aliens";
    t.setClock(at(5_000));
    const r = await getFactForUser("alice", t.deps);

    expect(r).toMatchObject({ ok: true, source: "generated", fact: { movieTitle: "Aliens" } });
  });

  it("returns NO_MOVIE for a user who hasn't onboarded", async () => {
    const t = setup({ carol: null });
    expect(await getFactForUser("carol", t.deps)).toMatchObject({ ok: false, code: "NO_MOVIE" });
    expect(t.generate).not.toHaveBeenCalled();
  });
});

describe("getFactForUser — burst protection", () => {
  it("a burst of concurrent requests triggers exactly one generation", async () => {
    const t = setup();
    t.generate.mockImplementation(async (movie) => {
      await new Promise((r) => setTimeout(r, 20)); // simulate OpenAI latency
      return `slow fact about ${movie}`;
    });

    const results = await Promise.all(Array.from({ length: 10 }, () => getFactForUser("alice", t.deps)));

    expect(t.generate).toHaveBeenCalledTimes(1);
    expect(t.facts).toHaveLength(1);
    const ids = new Set(results.map((r) => r.ok && r.fact.id));
    expect(ids.size).toBe(1);
  });

  it("does not serialize different users against each other", async () => {
    const t = setup();
    await Promise.all([getFactForUser("alice", t.deps), getFactForUser("bob", t.deps)]);
    expect(t.generate).toHaveBeenCalledTimes(2);
  });
});

describe("getFactForUser — OpenAI failure handling", () => {
  it("falls back to the most recent (stale) fact", async () => {
    const t = setup();
    const first = await getFactForUser("alice", t.deps);
    t.setClock(at(120_000));
    t.generate.mockRejectedValueOnce(new Error("timeout"));

    const r = await getFactForUser("alice", t.deps);
    expect(r).toMatchObject({ ok: true, source: "fallback" });
    expect(r.ok && first.ok && r.fact.id).toBe(first.ok && first.fact.id);
  });

  it("returns a friendly error when there is nothing cached", async () => {
    const t = setup();
    t.generate.mockRejectedValueOnce(new Error("500 from OpenAI"));

    const r = await getFactForUser("alice", t.deps);
    expect(r).toMatchObject({ ok: false, code: "GENERATION_FAILED" });
    expect(!r.ok && r.message).not.toMatch(/500|OpenAI/); // no internals leaked
  });

  it("outage burst: one OpenAI attempt, every request gets the stale fallback", async () => {
    const t = setup();
    await getFactForUser("alice", t.deps);
    t.setClock(at(120_000));
    t.generate.mockClear();
    t.generate.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 20));
      throw new Error("timeout");
    });

    const results = await Promise.all(Array.from({ length: 5 }, () => getFactForUser("alice", t.deps)));

    expect(t.generate).toHaveBeenCalledTimes(1); // waiters don't retry a failing API
    expect(results.every((r) => r.ok && r.source === "fallback")).toBe(true);
  });

  it("outage burst with nothing cached: one OpenAI attempt, friendly errors", async () => {
    const t = setup();
    t.generate.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 20));
      throw new Error("timeout");
    });

    const results = await Promise.all(Array.from({ length: 5 }, () => getFactForUser("alice", t.deps)));

    expect(t.generate).toHaveBeenCalledTimes(1);
    expect(results.every((r) => !r.ok && r.code === "GENERATION_FAILED")).toBe(true);
  });

  it("a lock/transaction failure degrades to the stale fact instead of throwing", async () => {
    const t = setup();
    await getFactForUser("alice", t.deps);
    t.setClock(at(120_000));
    const store = { ...t.store, withUserLock: async () => Promise.reject(new Error("tx timeout")) };

    const r = await getFactForUser("alice", { ...t.deps, store });
    expect(r).toMatchObject({ ok: true, source: "fallback" });
  });
});

describe("authorization", () => {
  it("a user cannot read another user's fact by id", async () => {
    const t = setup();
    const aliceFact = await getFactForUser("alice", t.deps);
    const id = aliceFact.ok ? aliceFact.fact.id : "";

    expect(await getFactByIdForUser(id, "alice", t.store)).toMatchObject({ id });
    expect(await getFactByIdForUser(id, "bob", t.store)).toBeNull();
  });

  it("a user's fact request never returns another user's cached fact", async () => {
    const t = setup({ alice: "Alien", bob: "Alien" }); // same movie!
    const a = await getFactForUser("alice", t.deps);
    const b = await getFactForUser("bob", t.deps);

    expect(b).toMatchObject({ ok: true, source: "generated" });
    expect(b.ok && a.ok && b.fact.id).not.toBe(a.ok && a.fact.id);
  });
});
