import "server-only";
import { prisma } from "@/lib/prisma";
import { createPrismaFactStore } from "@/lib/fact-store";
import { generateMovieFact } from "@/lib/openai";
import { getFactForUser, getFactByIdForUser } from "@/lib/facts";

/** Production wiring of the fact service. */
const store = createPrismaFactStore(prisma);

export function getFact(userId: string) {
  return getFactForUser(userId, { store, generate: generateMovieFact });
}

export function getFactById(factId: string, userId: string) {
  return getFactByIdForUser(factId, userId, store);
}
