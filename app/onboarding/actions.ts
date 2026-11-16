"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { movieTitleSchema } from "@/lib/validation";

export type OnboardingState = { error?: string; value?: string };

export async function saveFavoriteMovie(_prev: OnboardingState, formData: FormData): Promise<OnboardingState> {
  // Server Actions are public HTTP endpoints: re-check auth here, don't trust the page.
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const raw = formData.get("movie");
  const parsed = movieTitleSchema.safeParse(typeof raw === "string" ? raw : "");
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid movie title.", value: typeof raw === "string" ? raw : "" };
  }

  // Onboarding is first-time only: the `favoriteMovie: null` condition makes this
  // a no-op if a second tab (or a replayed request) already completed it.
  await prisma.user.updateMany({
    where: { id: user.id, favoriteMovie: null },
    data: { favoriteMovie: parsed.data },
  });

  redirect("/dashboard");
}
