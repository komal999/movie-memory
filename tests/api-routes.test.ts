import { beforeEach, describe, expect, it, vi } from "vitest";

// HTTP-level authorization: identity must come from the session, never the request.
const auth = vi.fn();
const getFact = vi.fn();
const getFactById = vi.fn();

vi.mock("@/auth", () => ({ auth: () => auth() }));
vi.mock("@/lib/fact-service", () => ({
  getFact: (...a: unknown[]) => getFact(...a),
  getFactById: (...a: unknown[]) => getFactById(...a),
}));

const { GET: getFactRoute } = await import("@/app/api/fact/route");
const { GET: getFactByIdRoute } = await import("@/app/api/facts/[id]/route");

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => vi.clearAllMocks());

describe("GET /api/fact", () => {
  it("returns 401 when not signed in and never touches the fact service", async () => {
    auth.mockResolvedValue(null);
    const res = await getFactRoute();
    expect(res.status).toBe(401);
    expect(getFact).not.toHaveBeenCalled();
  });

  it("uses the session user id", async () => {
    auth.mockResolvedValue({ user: { id: "alice" } });
    getFact.mockResolvedValue({ ok: true, source: "cache", fact: { id: "f1" } });
    const res = await getFactRoute();
    expect(res.status).toBe(200);
    expect(getFact).toHaveBeenCalledWith("alice");
  });

  it("maps generation failure to 503 with a friendly message", async () => {
    auth.mockResolvedValue({ user: { id: "alice" } });
    getFact.mockResolvedValue({ ok: false, code: "GENERATION_FAILED", message: "Try again." });
    const res = await getFactRoute();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: { code: "GENERATION_FAILED", message: "Try again." } });
  });

  it("returns a JSON 500 without internals when the database throws", async () => {
    auth.mockResolvedValue({ user: { id: "alice" } });
    getFact.mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.5:5432"));
    const res = await getFactRoute();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("INTERNAL");
    expect(JSON.stringify(body)).not.toMatch(/ECONNREFUSED|5432/);
  });

  it("returns a JSON 500 when the session lookup itself throws", async () => {
    auth.mockRejectedValue(new Error("db down"));
    const res = await getFactRoute();
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe("INTERNAL");
  });
});

describe("GET /api/facts/:id", () => {
  it("returns 401 when not signed in", async () => {
    auth.mockResolvedValue(null);
    const res = await getFactByIdRoute(new Request("http://x"), ctx("f1"));
    expect(res.status).toBe(401);
  });

  it("returns 404 for a fact owned by someone else", async () => {
    auth.mockResolvedValue({ user: { id: "bob" } });
    getFactById.mockResolvedValue(null);
    const res = await getFactByIdRoute(new Request("http://x"), ctx("alices-fact"));
    expect(res.status).toBe(404);
    expect(getFactById).toHaveBeenCalledWith("alices-fact", "bob");
  });

  it("returns a JSON 500 without internals when the database throws", async () => {
    auth.mockResolvedValue({ user: { id: "bob" } });
    getFactById.mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.5:5432"));
    const res = await getFactByIdRoute(new Request("http://x"), ctx("f1"));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toMatch(/ECONNREFUSED/);
  });
});
