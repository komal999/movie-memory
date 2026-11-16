import { describe, expect, it } from "vitest";
import { MOVIE_MAX_LENGTH, movieTitleSchema } from "@/lib/validation";

describe("movieTitleSchema", () => {
  it("trims and collapses whitespace", () => {
    expect(movieTitleSchema.parse("   The   Godfather  ")).toBe("The Godfather");
  });

  it("rejects empty / whitespace-only input", () => {
    expect(movieTitleSchema.safeParse("").success).toBe(false);
    expect(movieTitleSchema.safeParse("    ").success).toBe(false);
  });

  it("enforces the max length after trimming", () => {
    expect(movieTitleSchema.safeParse("a".repeat(MOVIE_MAX_LENGTH)).success).toBe(true);
    expect(movieTitleSchema.safeParse("a".repeat(MOVIE_MAX_LENGTH + 1)).success).toBe(false);
    expect(movieTitleSchema.safeParse(`  ${"a".repeat(MOVIE_MAX_LENGTH)}  `).success).toBe(true);
  });

  it("rejects control characters", () => {
    expect(movieTitleSchema.safeParse("Alien\u0000").success).toBe(false);
  });

  it("rejects non-strings", () => {
    expect(movieTitleSchema.safeParse(42).success).toBe(false);
    expect(movieTitleSchema.safeParse(null).success).toBe(false);
  });
});
